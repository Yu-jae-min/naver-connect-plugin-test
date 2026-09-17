// [PoC] 브라우저(Next.js 화면)가 구독하는 SSE 스트림.
// GET /api/connect/events
import { addClient, removeClient } from "@/lib/sseHub";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let clientId = -1;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data));
      clientId = addClient(send);
      // 최초 접속 확인용 메시지
      send(`event: stream.ready\ndata: {}\n\n`);
    },
    cancel() {
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
