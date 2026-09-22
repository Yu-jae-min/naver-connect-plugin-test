// [PoC] 실제 로그인 세션/액세스 토큰 검증 API를 흉내 낸다.
export async function GET(request: Request) {
  // 실제 세션 API처럼 액세스 토큰을 검증한 뒤 로그인 사업자 코드를 응답한다.
  const authorization = request.headers.get("authorization");

  if (authorization !== "Bearer test-merchant-token-001") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ merchantCode: "merchantCodeMockData" });
}
