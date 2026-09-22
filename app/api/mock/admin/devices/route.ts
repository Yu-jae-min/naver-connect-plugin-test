// [PoC] 실제 어드민의 deviceSerialNo → merchantCode 조회 API를 흉내 낸다.
export async function GET(request: Request) {
  // 실제 어드민 API처럼 단말 시리얼을 입력받아 소유 사업자 코드를 응답한다.
  const deviceSerialNo = new URL(request.url).searchParams.get(
    "deviceSerialNo",
  );

  if (deviceSerialNo !== "deviceSerialNoMockData") {
    return Response.json({ error: "Device not found" }, { status: 404 });
  }

  return Response.json({
    deviceSerialNo,
    merchantCode: "merchantCodeMockData",
  });
}
