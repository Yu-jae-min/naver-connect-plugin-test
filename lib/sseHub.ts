// [PoC] Vue2 → Next.js 화면 전환 테스트용 SSE 클라이언트 레지스트리.
// 실제 업무 설계(참고자료의 npay-connect-sse-design.md)에서는 revision/leaseGeneration 등
// 상태 관리가 필요하지만, 기능 검증 단계이므로 "이벤트 브로드캐스트 + 최신 상태 재조회" 정도만 구현한다.
// 주의: 로컬 `next dev` 단일 프로세스 기준으로만 동작하며, Vercel 서버리스 배포 환경에서는
// 인스턴스 간 메모리가 공유되지 않아 이 방식이 그대로 동작하지 않는다.
// (요청마다 다른 인스턴스가 뜰 수 있어 POST로 브로드캐스트한 내용을 다른 인스턴스에 붙은
//  SSE 클라이언트가 못 받는 경우가 실제로 발생한다.)

export type ConnectEvent = {
  revision: number;
  message: string;
  receivedAt: string;
};

type Client = {
  send: (data: string) => void;
};

const globalForSse = globalThis as unknown as {
  __sseClients?: Map<number, Client>;
  __sseNextClientId?: number;
  __sseRevision?: number;
  __sseLastEvent?: ConnectEvent | null;
};

const clients = globalForSse.__sseClients ?? (globalForSse.__sseClients = new Map());

export function addClient(send: (data: string) => void): number {
  const id = (globalForSse.__sseNextClientId = (globalForSse.__sseNextClientId ?? 0) + 1);
  clients.set(id, { send });
  return id;
}

export function removeClient(id: number): void {
  clients.delete(id);
}

export function getLatestState(): { revision: number; lastEvent: ConnectEvent | null } {
  return {
    revision: globalForSse.__sseRevision ?? 0,
    lastEvent: globalForSse.__sseLastEvent ?? null,
  };
}

export function broadcastDisplayChanged(message: string): ConnectEvent {
  const revision = (globalForSse.__sseRevision = (globalForSse.__sseRevision ?? 0) + 1);
  const event: ConnectEvent = { revision, message, receivedAt: new Date().toISOString() };
  globalForSse.__sseLastEvent = event;

  const payload = `id: ${revision}\nevent: display.changed\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients.values()) {
    client.send(payload);
  }

  return event;
}
