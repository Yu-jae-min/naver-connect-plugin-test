import { Amplify } from "aws-amplify";

const ENDPOINT = process.env.NEXT_PUBLIC_APPSYNC_HTTP_URL;
const REGION = process.env.NEXT_PUBLIC_APPSYNC_REGION;
const API_KEY = process.env.NEXT_PUBLIC_APPSYNC_API_KEY;

let configured = false;

export function getAppSyncConfigurationError(): string {
  if (!ENDPOINT || !REGION || !API_KEY) {
    return "AppSync 테스트 환경변수가 설정되지 않았습니다.";
  }
  if ([ENDPOINT, REGION, API_KEY].some((value) => value.includes("<"))) {
    return "AppSync 환경변수의 예시 값을 실제 endpoint와 region과 API Key로 교체해 주세요.";
  }
  try {
    const url = new URL(ENDPOINT);
    if (url.protocol !== "https:" || url.pathname !== "/event") {
      return "AppSync endpoint는 https://...appsync-api.../event 전체 주소여야 합니다.";
    }
  } catch {
    return "AppSync endpoint 형식이 올바르지 않습니다.";
  }
  return "";
}

export function configureAppSyncEvents(): void {
  if (configured) return;

  const error = getAppSyncConfigurationError();
  if (error || !ENDPOINT || !REGION || !API_KEY) {
    throw new Error(error || "AppSync 설정을 확인할 수 없습니다.");
  }

  // AWS 공식 Amplify Events 설정을 사용해 WebSocket protocol과 재연결 처리를 SDK에 맡긴다.
  Amplify.configure({
    API: {
      Events: {
        endpoint: ENDPOINT,
        region: REGION,
        defaultAuthMode: "apiKey",
        apiKey: API_KEY,
      },
    },
  });
  configured = true;
}
