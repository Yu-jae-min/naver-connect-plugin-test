type MerchantCodeResponse = {
  merchantCode?: string;
};

// 검증 API가 반환한 merchantCode를 공통 방식으로 읽어, 단말 연결과 Vue2 알림이
// 동일한 사업자 채널을 선택할 수 있게 한다. PoC에서는 모든 비정상 응답과 fetch/JSON
// 오류를 null로 단순화하며, 운영에서는 미등록·인증 실패·외부 API 장애를 구분해야 한다.
async function fetchMerchantCode(
  request: Request,
  path: string,
  init?: RequestInit,
): Promise<string | null> {
  try {
    const response = await fetch(new URL(path, request.url), {
      ...init,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as MerchantCodeResponse;
    return typeof body.merchantCode === "string" ? body.merchantCode : null;
  } catch {
    return null;
  }
}

export function resolveMerchantCodeByDevice(
  request: Request,
  deviceSerialNo: string,
): Promise<string | null> {
  // 단말이 전달한 시리얼의 소유 사업자를 확인해 다른 사업자 채널에 연결되는 것을 막는다.
  const params = new URLSearchParams({ deviceSerialNo });
  return fetchMerchantCode(request, `/api/mock/admin/devices?${params}`);
}

export function authenticateMerchant(request: Request): Promise<string | null> {
  // 검증된 merchantCode로 알림 대상을 구분하기 위해 Vue2의 토큰을 세션 API에 전달한다.
  const authorization = request.headers.get("authorization");
  if (!authorization) return Promise.resolve(null);

  return fetchMerchantCode(request, "/api/mock/session/me", {
    headers: { Authorization: authorization },
  });
}
