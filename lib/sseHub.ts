// [PoC] Vue2 → Next.js 화면 전환 테스트용 SSE 클라이언트 레지스트리.
// 실제 업무 설계(참고자료의 npay-connect-sse-design.md)에서는 revision/leaseGeneration 등
// 상태 관리가 필요하지만, 기능 검증 단계이므로 "이벤트 브로드캐스트" 최소 기능만 구현한다.
// 주의: 로컬 `next dev` 단일 프로세스 기준으로만 동작하며, Vercel 서버리스 배포 환경에서는
// 인스턴스 간 메모리가 공유되지 않아 이 방식이 그대로 동작하지 않는다.

type Client = {
  send: (data: string) => void;
};

const globalForSse = globalThis as unknown as {
  __sseClients?: Map<number, Client>;
  __sseNextClientId?: number;
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

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) {
    client.send(payload);
  }
}
