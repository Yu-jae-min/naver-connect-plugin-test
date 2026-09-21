// [PoC] 현재 최신 상태(revision + 마지막 이벤트) 조회.
// SSE가 단말기 화면 on/off, 웹뷰 백그라운드 전환 등으로 끊겼다가 재연결되었을 때,
// 그 사이 놓친 이벤트가 있는지 확인(catch-up)하기 위해 클라이언트가 호출한다.
// GET /api/connect/state
import { getLatestState } from "@/lib/sseHub";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getLatestState(), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
