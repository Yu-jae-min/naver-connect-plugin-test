# Vue2 사업자 화면 ↔ Next.js 단말 실시간 통신 기술 검토

## 1. 문서 목적

Vue2 매니저에서 발생한 이벤트를 같은 사업자에 속한 여러 Next.js 단말 WebView로 전달하기 위한 기술 검토와 테스트 진행 상황을 공유한다.

핵심 요구사항은 다음과 같다.

> Vue2에 로그인한 사업자 1명과 해당 사업자에 등록된 단말 N대를 `1:N` 관계로 연결하고, 다른 사업자의 단말에는 이벤트가 전달되지 않아야 한다.

현재는 SSE(Server-Sent Events) 방식으로 PoC를 구현했으며, 실제 운영 환경 적용 가능성과 AWS AppSync Events 전환 방식을 함께 검토하고 있다.

## 2. 테스트 환경

| 구분               | 환경                                                      |
| ------------------ | --------------------------------------------------------- |
| 이벤트 발신        | Vue2 매니저 웹                                            |
| 이벤트 수신        | Next.js 단말 WebView                                      |
| Next.js 테스트 URL | <https://naver-connect-plugin-test.vercel.app/>           |
| 단말 식별자        | `deviceSerialNo`                                          |
| 사업자 식별자      | `merchantCode`                                            |
| 현재 실시간 통신   | SSE (`EventSource`)                                       |
| 현재 상태          | PoC 구현 및 로컬 HTTP 연동 검증 완료, 실제 단말 검증 필요 |

현재 mock 테스트 값은 운영 인증 정보가 아니며 실제 연동 시 어드민 단말 API와 로그인 세션 API로 교체해야 한다.

## 3. 현재 구현된 1:N SSE 통신

### 3.1 전체 흐름

```text
Vue2 매니저 웹
  └─ POST /api/connect/notify + 로그인 토큰
       ↓
Next.js 서버
  ├─ 토큰 검증 후 로그인 사용자의 merchantCode 확인
  ├─ merchantCode별 SSE 채널 조회
  └─ 해당 채널에 연결된 단말에 이벤트 전송
       ↓
같은 사업자의 Next.js 단말 WebView N대
  ├─ deviceSerialNo로 소속 merchantCode 확인
  └─ GET /api/connect/events SSE 연결 유지
```

현재 SSE 허브는 다음과 같이 사업자별로 연결과 상태를 분리한다.

```ts
Map<
  merchantCode,
  {
    clients: Map<clientId, Client>;
    revision: number;
    lastEvent: ConnectEvent | null;
  }
>;
```

- 같은 `merchantCode`에 속한 여러 단말은 같은 사업자 채널에 등록된다.
- Vue2 알림 한 번은 로그인한 사업자의 채널에만 전달된다.
- 다른 사업자의 `clients`, `revision`, `lastEvent`는 별도로 관리한다.
- 현재 구현은 기존 N:N 구조가 아니라 사업자 기준 `1:N` PoC이다.

### 3.2 단말 환경: Next.js WebView

1. 페이지 로드 시 `deviceSerialNo`를 확보한다.
2. `/api/connect/state`를 호출해 등록된 단말인지 확인한다.
3. 서버가 `deviceSerialNo → merchantCode` 매핑을 조회한다.
4. 등록 단말이면 `/api/connect/events`에 `EventSource`로 연결한다.
5. 서버는 해당 단말 연결을 조회된 `merchantCode` 채널에 등록한다.
6. `display.changed` 이벤트를 수신하면 화면을 전환한다.
7. 현재 revision보다 낮거나 같은 중복 이벤트는 무시한다.
8. 재연결 또는 화면 복귀 시 `/api/connect/state`로 최신 이벤트를 확인한다.

현재 PoC에서는 단말 시리얼을 고정값으로 사용한다. 실제 WebView에서는 다음 값으로 교체해야 한다.

```ts
window.npayContext?.deviceSerialNo;
```

### 3.3 사업자 환경: Vue2 매니저

1. 로그인한 사용자가 테스트 버튼을 클릭한다.
2. Vue2가 `/api/connect/notify`에 로그인 액세스 토큰과 메시지를 보낸다.
3. 서버는 요청 body의 `merchantCode`를 신뢰하지 않고 토큰을 검증한다.
4. 검증된 로그인 사용자의 `merchantCode`를 확인한다.
5. 해당 사업자 채널에 연결된 단말 N대에만 이벤트를 전달한다.

```http
POST /api/connect/notify
Authorization: Bearer <login-access-token>
Content-Type: application/json

{
  "message": "결제가 시작되었습니다."
}
```

Vue2가 `merchantCode`를 직접 전달하지 않는 이유는 클라이언트 요청값을 임의로 조작할 수 있기 때문이다. 운영 환경에서도 로그인 세션이나 액세스 토큰에서 확인한 사업자 식별자를 사용해야 한다.

## 4. SSE 연결 안정성 대응

현재 PoC에는 WebView와 네트워크 상태 변화에 대응하기 위해 다음 로직이 구현되어 있다.

| 항목                | 현재 구현                                         |
| ------------------- | ------------------------------------------------- |
| 서버 heartbeat      | 15초 간격                                         |
| 클라이언트 watchdog | 10초 간격으로 연결 상태 검사                      |
| stale 판정          | 45초 동안 heartbeat 또는 이벤트가 없을 때         |
| 재연결              | 기존 EventSource를 닫고 2초 후 재시도             |
| 포그라운드 복귀     | `visibilitychange`에서 연결 상태와 최신 상태 확인 |
| 중복 방지           | 현재 revision보다 큰 이벤트만 적용                |
| catch-up            | 재연결 후 사업자별 최신 이벤트 1건 조회           |

heartbeat는 클라이언트가 죽은 연결을 판단하는 활동 신호다. 네트워크가 비정상적으로 끊겼을 때 서버의 스트림 정리 함수가 즉시 호출되는 것을 보장하지는 않는다.

또한 현재 2초 고정 재연결은 PoC용이다. 운영 환경에서는 여러 단말이 동시에 재접속하는 현상을 막기 위해 exponential backoff와 random jitter가 필요하다.

```text
예: 1초 → 2초 → 4초 → 8초 → 16초 → 최대 30초
```

## 5. 테스트 진행 상황

### 5.1 완료된 검증

- [x] Vue2 버튼 클릭으로 Next.js 단말 이벤트 전달
- [x] `연결 중 / 연결 완료 / 연결 실패` 상태 구분
- [x] heartbeat와 watchdog 기반 연결 이상 감지 로직 구현
- [x] 페이지 또는 WebView 포그라운드 복귀 시 연결 상태 재확인
- [x] 재연결 시 기존 EventSource 정리
- [x] 재연결 후 최신 이벤트 1건 catch-up
- [x] 단말별 `deviceSerialNo → merchantCode` mock 조회
- [x] Vue2 로그인 토큰 → `merchantCode` mock 조회
- [x] 동일 사업자의 단말 2대와 다른 사업자의 단말 1대를 이용한 격리 테스트
- [x] 사업자 A 알림은 A 단말 2대에만 전달
- [x] 사업자 B 알림은 B 단말 1대에만 전달
- [x] Next.js ESLint, TypeScript, production build 통과
- [x] Vue2 format 및 type check 통과

### 5.2 실제 환경에서 확인할 항목

- [ ] 실제 단말 WebView에서 `window.npayContext.deviceSerialNo` 조회
- [ ] 단말 화면 on/off 후 자동 재연결
- [ ] WebView background → foreground 복귀 후 재연결 및 catch-up
- [ ] Wi-Fi ↔ LTE/5G 전환과 IP 변경 시 복구
- [ ] 장시간 idle 또는 절전 모드에서 연결 유지 여부
- [ ] 동일 사업자에 등록된 여러 실제 단말의 1:N 전달
- [ ] 다른 사업자 단말로 이벤트가 전달되지 않는지 확인
- [ ] 단말이 꺼져 있을 때 Vue2 UI와 업무상 예외 처리 방식
- [ ] 단말에서 다른 작업 중에도 연결을 유지할지, 홈 화면에서만 연결할지 결정
- [ ] 운영 배포 후 단말 on/off 또는 WebView reload 시 최신 번들을 받는지 확인
- [ ] 연결 실패, 반복 재연결, 전송 실패에 대한 운영 로그와 알림 정책

브라우저 백그라운드 복귀 시 연결이 끊기는 현상은 일반 브라우저에서는 재현되지 않았다. 실제 단말 WebView와 OS 절전 정책에서 동작이 다를 수 있으므로 미검증 상태로 남겨 둔다.

## 6. 현재 SSE 방식의 운영상 문제

### 6.1 단일 프로세스 메모리에 연결이 집중됨

현재 `globalThis` 기반 SSE 허브는 하나의 Node.js 프로세스 안에서만 공유된다.

```text
Vue2 /notify
      ↓
Next.js 프로세스 1개
  ├─ 모든 SSE 연결
  ├─ merchant별 clients
  ├─ revision
  ├─ lastEvent
  └─ heartbeat timer
      ↓
단말 N대
```

서버를 여러 인스턴스로 늘리면 `/notify`를 처리한 인스턴스와 단말이 연결된 인스턴스가 다를 수 있다. 현재 구조에는 인스턴스 간 이벤트와 상태를 공유하는 Redis/Pub/Sub이 없으므로 이벤트가 누락될 수 있다.

### 6.2 서버 재시작 시 연결과 상태가 사라짐

배포, 장애 또는 프로세스 재시작 시 다음 항목이 함께 사라진다.

- 활성 SSE 연결
- 사업자별 client 목록
- revision
- lastEvent

단말은 재연결할 수 있지만, 서버 메모리에만 있던 최신 상태는 복구할 수 없다.

### 6.3 단말 수만큼 장기 연결이 필요함

SSE는 단말마다 별도의 HTTP 연결 하나가 필요하다. 특정 단말의 연결을 다른 단말이 재사용할 수는 없다.

단말 수가 증가하면 다음 자원도 증가한다.

- TCP socket
- ReadableStream
- client registry entry
- heartbeat 처리
- 전송 버퍼

다만 “Next.js 프로세스 1개이므로 1,000대에서 반드시 장애가 발생한다”고 단정할 수는 없다. 유휴 SSE 연결 1,000개는 적절한 서버에서 처리 가능할 수 있으며, 실제 한계는 메모리, file descriptor, event-loop lag, heartbeat 방식과 이벤트 빈도를 부하 테스트해 판단해야 한다.

### 6.4 느린 단말과 비정상 연결 정리

현재 PoC에는 명시적인 backpressure 상한이 없다. 단말이 데이터를 늦게 소비하면 버퍼가 누적될 수 있고, 조용히 끊긴 연결은 서버에서 늦게 정리될 수 있다.

### 6.5 재연결 폭주 가능성

배포나 네트워크 장애 후 모든 단말이 고정 2초 간격으로 재연결하면 요청이 한 시점에 집중될 수 있다.

### 6.6 이벤트 전달 완료를 보장하지 않음

Vue2의 성공 응답은 서버가 SSE stream에 이벤트를 enqueue했다는 의미다. 다음을 보장하지 않는다.

- 실제 단말 JavaScript 수신
- 화면 전환 완료
- 후속 업무 처리 완료

업무 완료까지 확인해야 한다면 단말이 별도의 ACK API를 호출해야 한다.

### 6.7 catch-up이 최신 이벤트 1건으로 제한됨

현재 `/api/connect/state`는 마지막 화면 이벤트 한 건만 복구한다. 연결이 끊긴 동안 발생한 모든 이벤트를 순서대로 처리해야 한다면 영속 event log가 필요하다.

## 7. 현재 PoC를 운영에 사용하기 위해 필요한 개선

현재 EventSource를 유지하려면 다음 구조가 필요하다.

```text
Vue2
  ↓
인증된 API
  ├─ revision / lastEvent 저장
  └─ Redis Pub/Sub publish
       ↓
ElastiCache Redis
       ↓
ALB
       ↓
여러 SSE Gateway
       ↓
단말 WebView N대
```

주요 개선 항목은 다음과 같다.

1. `revision`과 `lastEvent`를 Redis 또는 DB로 이전한다.
2. Redis Pub/Sub으로 여러 SSE Gateway에 이벤트를 전달한다.
3. 연결 처리를 전용 ECS/Fargate SSE Gateway로 분리한다.
4. ALB로 신규 연결을 여러 Gateway에 분산한다.
5. task별 연결 상한과 backpressure 정책을 적용한다.
6. 단말별 timer 대신 shared heartbeat scheduler를 검토한다.
7. exponential backoff와 jitter를 적용한다.
8. 배포 시 connection draining을 적용한다.
9. 활성 연결 수, 재연결 수, event-loop lag, 메모리, fan-out 시간을 모니터링한다.

## 8. 대안 검토: AWS AppSync Events

AWS AppSync Events는 WebSocket 연결 관리, 수평 확장과 채널 기반 fan-out을 AWS에 위임하는 방식이다.

```text
Vue2
  └─ 로그인 토큰으로 Backend /notify 호출
       ↓
Backend
  ├─ 로그인 토큰 → merchantCode 확인
  ├─ 필요 시 대상 단말 소유 검증
  ├─ event/revision DB 저장
  └─ IAM으로 AppSync Events publish
       ↓
AWS AppSync Events
  ├─ /paymint/merchant/{merchantCode}
  └─ /paymint/device/{deviceSerialNo}
       ↓
Next.js 단말 WebView N대
```

### 8.1 1:N 채널 구성

사업자의 모든 단말에 전달할 때는 사업자 채널을 사용한다.

```text
/paymint/merchant/{merchantCode}
```

특정 단말만 대상으로 할 때는 단말 채널을 사용한다.

```text
/paymint/device/{deviceSerialNo}
```

각 단말은 인증된 자기 사업자 채널과 자기 단말 채널만 구독해야 한다. Vue2는 AppSync에 직접 publish하지 않고 기존 백엔드를 호출한다. 백엔드는 로그인 토큰에서 확인한 `merchantCode` 채널에만 publish한다.

### 8.2 AppSync 전환 시 변경되는 부분

| 현재 SSE 구성            | AppSync 전환 후                                        |
| ------------------------ | ------------------------------------------------------ |
| Next.js `EventSource`    | AppSync Events SDK 또는 WebSocket 구독                 |
| `/api/connect/events`    | 제거 가능                                              |
| `globalThis` client Map  | AppSync 연결 및 채널 관리로 대체                       |
| 서버 heartbeat           | AppSync 연결 계층이 관리하되 클라이언트 복구 검증 필요 |
| `revision` / `lastEvent` | DB 또는 별도 영속 저장소로 이전                        |
| `/api/connect/notify`    | 메모리 broadcast 대신 AppSync channel publish          |
| `/api/connect/state`     | DB 기반 catch-up API로 유지                            |

### 8.3 AppSync 적용 시 주의사항

- AppSync Events 구독은 WebSocket이다. 현재 `EventSource` 코드를 그대로 사용할 수 없다.
- API Key만으로는 단말별 채널 격리를 안전하게 보장하기 어렵다.
- 공통 Cognito unauthenticated role도 단말별 신원을 자동으로 만들지 않는다.
- 단말별 short-lived token과 AppSync `OnSubscribe` authorization을 검토해야 한다.
- `deviceSerialNo` 문자열만으로는 실제 단말을 강하게 인증할 수 없다.
- AppSync가 연결을 관리해도 WebView background 상태의 socket 유지까지 보장하지 않는다.
- 자동 재연결, 재인증, 재구독, revision 중복 제거와 catch-up은 클라이언트에서 검증해야 한다.
- AppSync publish 성공은 단말의 실제 화면 전환 완료를 의미하지 않는다.
- 오프라인 이벤트 replay가 필요하면 별도 DB 또는 event log가 필요하다.

## 9. 현재 판단

### SSE Gateway 방식이 적합한 경우

- 기존 EventSource 호환성을 유지해야 한다.
- 연결 인프라와 Redis를 직접 운영할 수 있다.
- AWS 관리형 서비스 종속보다 직접 제어가 중요하다.

### AppSync Events 방식이 적합한 경우

- Next.js 단말 연결 코드를 WebSocket 방식으로 변경할 수 있다.
- SSE Gateway, Redis, ALB의 운영 부담을 줄이고 싶다.
- AppSync 채널 authorization과 AWS 서비스 종속을 수용할 수 있다.

현재 규모가 약 1,000대이고 단말 연결 코드 변경이 가능하다면 AppSync Events를 우선 소규모 PoC로 검증할 가치가 있다. 단, 다음 구성을 함께 검증해야 한다.

```text
단말별 인증
+ 사업자/단말 채널 권한 검증
+ 백엔드 IAM publish
+ DB revision/catch-up
+ 재연결 및 ACK 정책
```

## 10. 다음 확인 및 결정 사항

1. 최대 동시 접속 단말 수와 실제 24시간 연결 여부
2. 사업자 전체 broadcast만 필요한지 특정 단말 타겟팅도 필요한지
3. 단말을 `deviceSerialNo` 외에 어떤 정보로 인증할 수 있는지
4. 화면 전환 완료 ACK가 필요한지
5. 연결 중 놓친 모든 이벤트가 필요한지 최신 상태 한 건이면 충분한지
6. 홈 화면에서만 연결할지 단말의 모든 화면에서 연결할지
7. 실제 WebView가 AppSync WebSocket과 SDK를 지원하는지
8. 매장 네트워크와 방화벽에서 WebSocket 연결이 허용되는지
9. 실제 단말 10~30대를 이용한 장시간 연결 및 네트워크 전환 테스트
10. SSE Gateway 방식과 AppSync Events 방식의 부하 및 비용 비교

## 11. 로컬 실행 및 기본 테스트

### 11.1 Next.js 실행

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>으로 접속한다.

### 11.2 PoC 기본 테스트 값

| 구분 | 값 |
| --- | --- |
| 단말 시리얼 | `deviceSerialNoMockData` |
| 사업자 코드 | `merchantCodeMockData` |
| Vue2 PoC 토큰 | `test-merchant-token-001` |

현재 PoC는 다음 비동기 mock API를 통해 단말 소속과 로그인 사용자의 사업자를 확인한다.

- `GET /api/mock/admin/devices?deviceSerialNo=...`
- `GET /api/mock/session/me` + Vue2 `Authorization` 헤더

Vue2 호출을 대신해 다음 명령으로 알림 전송을 확인할 수 있다.

```bash
curl -X POST http://localhost:3000/api/connect/notify \
  -H 'Authorization: Bearer test-merchant-token-001' \
  -H 'Content-Type: application/json' \
  -d '{"message":"결제가 시작되었습니다."}'
```

mock API와 고정 토큰은 PoC 전용이다. 운영 환경에서는 실제 어드민 단말 API와 로그인·세션 검증 API로 교체해야 한다.

### 11.3 주요 검증 명령

```bash
npx eslint app
npx tsc --noEmit
npm run build
git diff --check
```

## 12. 참고 문서

- [1:N SSE 연동 흐름](./public/docs/merchant-device-sse-flow.html)
- [단말 3대 연결 예시](./public/docs/merchant-sse-at-a-glance.html)
- [대규모 단말 실시간 전달 방식 비교](./public/docs/realtime-delivery-options.html)
- [AWS 단말 상시 연결 아키텍처 비교](./public/docs/aws-realtime-architecture-decision.html)
