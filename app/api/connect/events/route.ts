// [PoC] 브라우저(Next.js 화면)가 구독하는 SSE 스트림.
// GET /api/connect/events
//
// 단말기 화면 on/off, 웹뷰 백그라운드 전환 시 중간 네트워크 장비나 OS가 idle
// 커넥션을 조용히 끊을 수 있다. 이 경우 서버 쪽 ReadableStream은 아직 열려 있다고
// 믿고 있어도 실제로는 클라이언트에 데이터가 도달하지 않는 상태가 될 수 있다.
// 주기적으로 heartbeat를 보내 실제로 끊어졌다면 enqueue 시점에 에러가 나서
// cancel()이 호출되도록 유도하고, 클라이언트가 "마지막 수신 시각"으로 죽은 연결을
// 감지할 수 있는 신호를 제공한다.
import { addClient, removeClient } from "@/lib/sseHub";

export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 15000;

export async function GET() {
  const encoder = new TextEncoder();
  let clientId = -1;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // 컨트롤러가 이미 닫힌 뒤 늦게 도착한 send는 무시한다.
        }
      };

      clientId = addClient(send);
      // 최초 접속 확인용 메시지
      send(`event: stream.ready\ndata: {}\n\n`);

      heartbeat = setInterval(
        () => send(`event: heartbeat\ndata: {}\n\n`),
        HEARTBEAT_INTERVAL_MS,
      );
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
