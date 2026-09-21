"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

// SSE 연결 상태를 하나의 값으로 표현.
// connected/connecting 두 boolean으로 나누면 "연결 실패(error)"와
// "아직 연결 시도 전(connecting)" 상태가 둘 다 connected=false로 겹쳐서
// 구분이 안 되는 문제가 있었음 (에러 발생 시에도 스피너가 계속 노출됨).
type ConnectionStatus = "connecting" | "connected" | "error";

type ConnectEvent = {
  revision: number;
  message: string;
  receivedAt: string;
};

// 서버(app/api/connect/events/route.ts)가 15초 주기로 heartbeat를 보낸다.
// 이 값의 3배 이상 아무 신호(heartbeat/이벤트)도 없으면, 단말기 화면 on/off나
// 웹뷰 백그라운드 전환 등으로 연결이 조용히 끊긴 것으로 보고 강제 재연결한다.
// EventSource.readyState는 이런 상황에서도 계속 OPEN으로 남아있을 수 있어
// onerror만으로는 감지되지 않는다.
const STALE_CONNECTION_MS = 45000;
const WATCHDOG_INTERVAL_MS = 10000;

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [event, setEvent] = useState<ConnectEvent | null>(null);

  const revisionRef = useRef(0);
  // 이 페이지 세션에서 EventSource가 "처음" 연결된 것인지 구분한다.
  // 최초 연결 때는 서버에 남아있는 과거 이벤트(다른 세션/이전 테스트에서 온 것)를
  // 화면에 띄우면 안 되고, 리비전 기준선만 맞춰야 한다. 재연결 때만 그 사이
  // 놓친 이벤트를 따라잡는다(catch-up).
  const hasConnectedOnceRef = useRef(false);
  const lastActivityAtRef = useRef<number>(0);
  const sourceRef = useRef<EventSource | null>(null);

  const applyEvent = useCallback((next: ConnectEvent) => {
    if (next.revision <= revisionRef.current) return; // 이미 처리한 이벤트는 무시
    revisionRef.current = next.revision;
    setEvent(next);
  }, []);

  // 최초 연결 시: 화면에는 표시하지 않고 현재 리비전만 기준선으로 맞춘다.
  const syncBaseline = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/state", { cache: "no-store" });
      const state = await res.json();
      if (
        typeof state.revision === "number" &&
        state.revision > revisionRef.current
      ) {
        revisionRef.current = state.revision;
      }
    } catch {
      // 실패해도 기준선은 유지되며, 이후 정상 이벤트는 그대로 반영된다.
    }
  }, []);

  // SSE가 끊겨 있던 사이 놓친 이벤트가 있는지 최신 상태를 조회해 따라잡는다.
  const catchUp = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/state", { cache: "no-store" });
      const state = await res.json();
      if (state.lastEvent) applyEvent(state.lastEvent);
    } catch {
      // 네트워크 오류는 무시하고 다음 재연결/재조회 때 다시 시도한다.
    }
  }, [applyEvent]);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (disposed) return;

      // 재연결 시 이전 EventSource가 남아있다면 반드시 닫는다.
      // 그대로 두면 중복 연결과 이벤트 리스너가 누적되어 리크로 이어진다.
      sourceRef.current?.close();
      clearReconnectTimer();

      const source = new EventSource("/api/connect/events");
      sourceRef.current = source;

      source.onopen = () => {
        lastActivityAtRef.current = Date.now();
        setStatus("connected");

        if (!hasConnectedOnceRef.current) {
          hasConnectedOnceRef.current = true;
          syncBaseline();
        } else {
          // 재연결 성공 시점에는 항상 최신 상태를 다시 확인한다.
          // (연결이 끊겼던 동안 온 이벤트를 SSE만으로는 복구할 수 없기 때문)
          catchUp();
        }
      };

      source.onerror = () => {
        // 연결 실패/끊김. connecting=false, connected=false로 뭉개지 않고
        // "error"로 명시해 화면에서 "연결 안됨"을 바로 표시할 수 있게 함.
        setStatus("error");
        clearReconnectTimer();
        reconnectTimer = setTimeout(connect, 2000);
      };

      source.addEventListener("stream.ready", () => {
        lastActivityAtRef.current = Date.now();
      });

      source.addEventListener("heartbeat", () => {
        lastActivityAtRef.current = Date.now();
      });

      source.addEventListener("display.changed", (e: MessageEvent) => {
        lastActivityAtRef.current = Date.now();
        applyEvent(JSON.parse(e.data));
      });
    };

    // 워치독: heartbeat 포함 아무 신호도 오래 없으면 "죽은 연결"로 간주하고
    // 강제로 재연결한다. onerror에만 의존하면 소켓이 조용히 끊긴 경우를 놓친다.
    const checkConnectionHealth = () => {
      const idleFor = Date.now() - lastActivityAtRef.current;
      if (idleFor > STALE_CONNECTION_MS) {
        setStatus("error");
        connect();
      }
    };

    // 단말기 화면이 꺼졌다가 켜지거나 웹뷰가 백그라운드에서 돌아올 때,
    // 워치독 주기를 기다리지 않고 즉시 연결 상태를 재확인하고 최신 상태를
    // 다시 조회한다. 화면이 꺼져있던 동안 온 이벤트는 SSE가 살아있었더라도
    // 브라우저/웹뷰의 백그라운드 스로틀링으로 지연 전달될 수 있기 때문이다.
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      checkConnectionHealth();
      if (sourceRef.current?.readyState === EventSource.OPEN) {
        catchUp();
      }
    };

    lastActivityAtRef.current = Date.now();
    connect();
    watchdogTimer = setInterval(checkConnectionHealth, WATCHDOG_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      clearReconnectTimer();
      if (watchdogTimer) clearInterval(watchdogTimer);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [applyEvent, catchUp, syncBaseline]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {status === "connecting" ? (
          // 최초 연결 시도 중일 때만 스피너 노출.
          // error 상태는 여기 걸리지 않고 아래 대기 화면 분기로 빠져
          // "SSE 연결 상태: 연결 안됨" 문구가 보이게 됨.
          <div className={styles.intro}>
            <span className={styles.spinner} aria-label="연결 중" />
            <p>SSE 연결 중...</p>
          </div>
        ) : event ? (
          <div className={styles.intro}>
            <h1>결제 화면으로 전환됨</h1>
            <p>{event.message}</p>
            <p>수신 시각: {event.receivedAt}</p>
          </div>
        ) : (
          <div className={styles.intro}>
            <h1>대기 화면</h1>
            <p>
              POS(Vue2)에서 이벤트가 도착하면 이 화면이 전환됩니다.
              <br />
              SSE 연결 상태: {status === "connected" ? "연결됨" : "연결 안됨"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
