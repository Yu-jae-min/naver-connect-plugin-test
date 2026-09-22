// [PoC] 브라우저(Next.js 화면)가 구독하는 SSE 스트림.
// GET /api/connect/events
//
// 단말기 화면 on/off, 웹뷰 백그라운드 전환 시 중간 네트워크 장비나 OS가 idle
// 커넥션을 조용히 끊을 수 있다. 이 경우 서버 쪽 ReadableStream은 아직 열려 있다고
// 믿고 있어도 실제로는 클라이언트에 데이터가 도달하지 않는 상태가 될 수 있다.
// 주기적인 heartbeat는 idle 연결이 오래 방치되는 것을 줄이고, 클라이언트가
// "마지막 수신 시각"으로 죽은 연결을 판정할 수 있는 활동 신호를 제공한다.
// 네트워크 단절이 즉시 서버의 cancel()로 이어진다고 보장할 수 없으므로,
// 실제 복구 판단은 클라이언트 watchdog과 재연결 흐름이 담당한다.
import { addClient, removeClient } from "@/lib/sseHub";
import { resolveMerchantCodeByDevice } from "@/lib/connectIdentity";

export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 15000;

export async function GET(request: Request) {
  const deviceSerialNo = new URL(request.url).searchParams.get(
    "deviceSerialNo",
  );
  if (!deviceSerialNo) {
    return Response.json({ error: "deviceSerialNo is required" }, { status: 400 });
  }

  // SSE를 열기 전에 단말의 소유 사업자를 확인해 해당 사업자 그룹에만 등록한다.
  const merchantCode = await resolveMerchantCodeByDevice(
    request,
    deviceSerialNo,
  );
  if (!merchantCode) {
    return Response.json({ error: "Unregistered device" }, { status: 403 });
  }

  const encoder = new TextEncoder();
  let clientId = -1;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // 이미 종료된 스트림에 늦게 도착한 heartbeat/이벤트가 라우트를 깨뜨리지 않게 한다.
          // 이 catch 자체가 client 제거를 보장하지는 않으며, 정상 제거는 cancel()에서 수행한다.
        }
      };

      // 동일 사업자에 속한 여러 단말이 같은 Vue2 알림을 받도록 그룹에 연결한다.
      clientId = addClient(merchantCode, send);
      // 애플리케이션 이벤트와 별개인 연결 활동 신호로 watchdog 기준 시각을 초기화한다.
      send(`event: stream.ready\ndata: {}\n\n`);

      heartbeat = setInterval(
        () => send(`event: heartbeat\ndata: {}\n\n`),
        HEARTBEAT_INTERVAL_MS,
      );
    },
    cancel() {
      // 소비자가 스트림을 취소한 경우 타이머와 merchant 채널 등록을 함께 정리한다.
      // 비정상 네트워크 단절에서는 cancel 감지가 지연되거나 런타임별로 다를 수 있다.
      if (heartbeat) clearInterval(heartbeat);
      removeClient(merchantCode, clientId);
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
