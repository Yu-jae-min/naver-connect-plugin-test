// [PoC] 브라우저(Next.js 화면)가 구독하는 SSE 스트림.
// GET /api/connect/events
//
// 주의: Vercel 서버리스 Function은 실행 시간 제한(maxDuration)이 있어 이 스트림은
// 언젠가 플랫폼에 의해 강제 종료된다. 클라이언트(EventSource)가 자동 재연결하는 것을
// 전제로 하고, 재연결 시 "놓친 이벤트"를 따라잡을 수 있도록 /api/connect/state를
// 함께 폴링하는 방식으로 보완한다 (page.tsx 참고).
import { addClient, removeClient } from "@/lib/sseHub";

export const dynamic = "force-dynamic";
// Vercel Hobby 기본 10초보다 넉넉하게 잡아둔다. 플랫폼 상한을 넘기면 무시되고
// 플랫폼 기본값이 적용된다.
export const maxDuration = 60;

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

      // 아무 이벤트가 없어도 주기적으로 보내서
      // 중간 프록시/NAT가 idle 커넥션을 조용히 끊는 것을 방지하고,
      // 끊겼을 때 클라이언트(EventSource)가 최대한 빨리 에러를 감지해 재연결하게 한다.
      heartbeat = setInterval(() => send(`event: heartbeat\ndata: {}\n\n`), HEARTBEAT_INTERVAL_MS);
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
