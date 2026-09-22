// [PoC] merchantCode별로 Vue2 알림 대상 단말과 최신 화면 이벤트를 관리하는 SSE 허브.
// 같은 사업자의 여러 단말은 한 채널을 공유하고, 다른 사업자의 clients/revision/lastEvent는
// 별도 채널로 격리한다. 상태는 globalThis에 있으므로 dev/prod 여부와 관계없이 현재 Node.js
// 프로세스 안에서만 공유된다. 서버리스·멀티 프로세스·다중 replica에서는 외부 저장소와
// Pub/Sub 없이 이 구조를 그대로 사용할 수 없다.
//
// 단말기(브라우저 웹뷰)를 켜고 끄는 시나리오 대응:
// 화면이 꺼지거나 백그라운드로 전환되면 OS/웹뷰가 소켓을 조용히 끊는 경우가 있고,
// 이때 클라이언트 EventSource는 onerror 없이 readyState만 OPEN으로 남아 "죽은 연결"이
// 될 수 있다. 재연결 시 최신 화면 상태를 복구할 수 있도록 사업자별 마지막 이벤트 1건을
// revision과 함께 기억하고 /api/connect/state로 조회한다. 이벤트 이력 전체를 보관하지 않는다.

export type ConnectEvent = {
  revision: number;
  message: string;
  receivedAt: string;
};

type Client = {
  send: (data: string) => void;
};

type MerchantCodeChannel = {
  // 한 사업자의 여러 단말 연결과 재연결 상태를 다른 사업자와 섞이지 않게 묶는다.
  clients: Map<number, Client>;
  revision: number;
  lastEvent: ConnectEvent | null;
};

const globalForSse = globalThis as unknown as {
  __sseMerchantCodeChannels?: Map<string, MerchantCodeChannel>;
  __sseNextClientId?: number;
};

const channels =
  // Next.js 개발 환경의 모듈 재평가 때 기존 연결 레지스트리를 가능한 한 유지하기 위한 전역 보관이다.
  // 다른 서버 프로세스나 인스턴스와 메모리를 공유하는 장치는 아니다.
  globalForSse.__sseMerchantCodeChannels ??
  (globalForSse.__sseMerchantCodeChannels = new Map());

function getOrCreateChannel(merchantCode: string): MerchantCodeChannel {
  // 같은 merchantCode는 항상 같은 채널을 재사용해 1:N 단말 브로드캐스트가 가능하게 한다.
  const existing = channels.get(merchantCode);
  if (existing) return existing;

  const channel: MerchantCodeChannel = {
    clients: new Map(),
    revision: 0,
    lastEvent: null,
  };
  channels.set(merchantCode, channel);
  return channel;
}

export function addClient(
  merchantCode: string,
  send: (data: string) => void,
): number {
  // clientId는 한 프로세스 안에서 연결을 제거하기 위한 내부 키이며 단말 고유번호가 아니다.
  const id = (globalForSse.__sseNextClientId =
    (globalForSse.__sseNextClientId ?? 0) + 1);
  getOrCreateChannel(merchantCode).clients.set(id, { send });
  return id;
}

export function removeClient(merchantCode: string, id: number): void {
  // lastEvent는 재연결 복구에 필요하므로 마지막 client가 빠져도 merchant 채널은 유지한다.
  channels.get(merchantCode)?.clients.delete(id);
}

export function getLatestState(merchantCode: string): {
  revision: number;
  lastEvent: ConnectEvent | null;
} {
  // 재연결한 단말이 자기 사업자의 마지막 이벤트 1건만 복구하도록 채널별 상태를 반환한다.
  const channel = channels.get(merchantCode);
  return channel
    ? { revision: channel.revision, lastEvent: channel.lastEvent }
    : { revision: 0, lastEvent: null };
}

export function broadcastDisplayChanged(
  merchantCode: string,
  message: string,
): ConnectEvent {
  // 인증된 사업자 채널만 갱신하고 순회해 다른 사업자 단말로 이벤트가 새지 않게 한다.
  const channel = getOrCreateChannel(merchantCode);
  // revision은 merchant 채널 안에서만 단조 증가하며 다른 사업자와 비교하는 전역 번호가 아니다.
  const revision = ++channel.revision;
  const event: ConnectEvent = {
    revision,
    message,
    receivedAt: new Date().toISOString(),
  };
  channel.lastEvent = event;

  const payload = `id: ${revision}\nevent: display.changed\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of channel.clients.values()) {
    client.send(payload);
  }

  return event;
}
