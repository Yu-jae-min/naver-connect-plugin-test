# Vue2 ↔ Next.js AppSync Events 통신 PoC

Vue2 사업자 화면의 이벤트를 Next.js 단말 화면에 전달하기 위한 실시간 통신 테스트 프로젝트다.

최종 목표는 로그인 사업자 1명과 해당 사업자의 단말 N대를 격리된 채널로 연결하는 것이다. 현재 1차 단계에서는 사업자·단말 식별을 적용하기 전에 AWS AppSync Events의 실제 통신 가능 여부만 검증한다.

## 현재 1차 테스트

```text
Vue2 브라우저
  └─ HTTP publish + 테스트 API Key
       ↓
AWS AppSync Events /default/test
       ↓
Next.js 브라우저
  └─ WebSocket subscribe → WAITING UI를 MAIN UI로 전환
```

- Vue2는 AppSync HTTP endpoint에 직접 `display.changed` 이벤트를 발행한다.
- Next.js는 Amplify Events SDK로 동일 고정 채널을 구독한다.
- Next.js는 subscription의 `ready` Promise가 완료된 이후 연결 완료를 표시한다.
- 이 단계에는 `deviceSerialNo`, `merchantCode`, 로그인 토큰, ACK, 이벤트 복구가 없다.

## 테스트 환경변수

Next.js:

```env
NEXT_PUBLIC_APPSYNC_HTTP_URL=https://<api-id>.appsync-api.us-east-1.amazonaws.com/event
NEXT_PUBLIC_APPSYNC_REGION=us-east-1
NEXT_PUBLIC_APPSYNC_API_KEY=<test-api-key>
NEXT_PUBLIC_APPSYNC_CHANNEL=/default/test
```

Vue2 manager:

```env
APPSYNC_HTTP_URL=https://<api-id>.appsync-api.us-east-1.amazonaws.com/event
APPSYNC_API_KEY=<test-api-key>
APPSYNC_CHANNEL=/default/test
```

두 앱에서 동일한 AppSync 리소스와 채널을 설정한다. 환경변수의 API Key는 브라우저 번들에 노출되므로 권한과 수명을 제한한 테스트 Key만 사용하고 테스트 후 폐기 또는 회전해야 한다.

## 실행 및 확인

1. Next.js 화면에서 AppSync 구독 상태가 `연결됨`인지 확인한다.
2. Vue2 manager의 Npay Connect 테스트 화면에서 이벤트 전송 버튼을 누른다.
3. Vue2에 전송 성공이 표시되고 Next.js 대기 화면이 메인 화면으로 바뀌는지 확인한다.
4. 다른 채널로 발행했을 때 Next.js 화면이 바뀌지 않는지 확인한다.

```bash
npm run dev
```

문서 목록은 `/docs`, 현재 단계의 상세 아키텍처와 후속 백로그는 `/docs/appsync-connectivity-poc.html`에서 확인할 수 있다. 기존 SSE 구조와 대규모 연결 대안 문서는 의사결정 참고 이력으로 보존한다.

## 다음 단계

- Vue2 로그인 토큰으로 검증한 `merchantCode` 채널에 백엔드가 publish
- 단말의 `deviceSerialNo → merchantCode` 조회와 구독 채널 권한 검증
- 사업자 전체 단말 1:N 및 특정 단말 타겟 채널
- API Key 직접 publish를 IAM 방식으로 교체
- 재연결, keepalive, 실제 WebView background/on-off, 1,000대 이상 부하 테스트

세부 우선순위와 운영 보안 항목은 AppSync 1차 PoC HTML 문서의 백로그를 기준으로 한다.
