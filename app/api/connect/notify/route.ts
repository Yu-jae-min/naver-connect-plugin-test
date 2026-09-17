// [PoC] Vue2(POS)에서 "화면 전환" 이벤트를 보낼 때 호출하는 엔드포인트.
// POST /api/connect/notify
import { broadcast } from "@/lib/sseHub";

function withCors(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  broadcast("display.changed", {
    message: body?.message ?? "결제가 시작되었습니다.",
    receivedAt: new Date().toISOString(),
  });

  return withCors(Response.json({ ok: true }));
}
