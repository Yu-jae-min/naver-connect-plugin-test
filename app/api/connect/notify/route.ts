// [PoC] Vue2(POS)에서 "화면 전환" 이벤트를 보낼 때 호출하는 엔드포인트.
// POST /api/connect/notify
import { broadcastDisplayChanged } from "@/lib/sseHub";
import { authenticateMerchant } from "@/lib/connectIdentity";

function withCors(response: Response): Response {
  // 서로 다른 origin의 Vue2 테스트 화면에서 Authorization 포함 요청을 보내기 위한 PoC CORS다.
  // 운영에서는 허용 origin과 credential/CSRF 정책을 별도로 확정해야 한다.
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return response;
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  // body의 사업자 값을 신뢰하지 않고, Vue2 토큰을 검증해 알림 대상 merchantCode를 정한다.
  const merchantCode = await authenticateMerchant(request);
  if (!merchantCode) {
    return withCors(Response.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const body = await request.json().catch(() => ({}));

  // 검증된 merchantCode 그룹에만 화면 전환 이벤트를 전송한다.
  const event = broadcastDisplayChanged(
    merchantCode,
    body?.message ?? "결제가 시작되었습니다.",
  );

  return withCors(Response.json({ ok: true, event }));
}
