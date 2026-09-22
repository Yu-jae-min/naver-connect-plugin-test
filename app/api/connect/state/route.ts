// [PoC] 현재 최신 상태(revision + 마지막 이벤트) 조회.
// SSE가 단말기 화면 on/off, 웹뷰 백그라운드 전환 등으로 끊겼다가 재연결되었을 때,
// 그 사이 놓친 최신 화면 이벤트 1건이 있는지 확인(catch-up)하기 위해 클라이언트가 호출한다.
// 이벤트 로그 API가 아니므로 여러 중간 이벤트의 순차 재생은 지원하지 않는다.
// GET /api/connect/state
import { getLatestState } from "@/lib/sseHub";
import { resolveMerchantCodeByDevice } from "@/lib/connectIdentity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deviceSerialNo = new URL(request.url).searchParams.get(
    "deviceSerialNo",
  );
  if (!deviceSerialNo) {
    return Response.json({ error: "deviceSerialNo is required" }, { status: 400 });
  }

  // 요청 단말의 사업자를 먼저 확인해 다른 사업자의 revision/lastEvent 노출을 막는다.
  const merchantCode = await resolveMerchantCodeByDevice(
    request,
    deviceSerialNo,
  );
  if (!merchantCode) {
    return Response.json({ error: "Unregistered device" }, { status: 403 });
  }

  return Response.json(getLatestState(merchantCode), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
