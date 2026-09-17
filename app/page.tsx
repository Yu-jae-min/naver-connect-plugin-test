"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type ConnectEvent = {
  revision: number;
  message: string;
  receivedAt: string;
};

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState<ConnectEvent | null>(null);
  const revisionRef = useRef(0);
  // 이 페이지 세션에서 EventSource가 "처음" 연결된 것인지 구분한다.
  // 최초 연결 때는 서버에 남아있는 과거 이벤트(다른 세션/이전 테스트에서 온 것)를
  // 화면에 띄우면 안 되고, 리비전 기준선만 맞춰야 한다.
  const hasInitializedRef = useRef(false);

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
      if (typeof state.revision === "number" && state.revision > revisionRef.current) {
        revisionRef.current = state.revision;
      }
    } catch {
      // 실패해도 기준선은 0으로 유지되며, 이후 정상 이벤트는 그대로 반영된다.
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
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      source = new EventSource("/api/connect/events");

      source.onopen = () => {
        setConnected(true);
        if (!hasInitializedRef.current) {
          // 이 페이지 세션의 최초 연결: 서버에 남아있는 과거 이벤트는 화면에 띄우지 않고
          // 리비전 기준선만 맞춘다.
          hasInitializedRef.current = true;
          syncBaseline();
        } else {
          // 재연결 성공 시점에는 항상 최신 상태를 다시 확인한다.
          // (연결이 끊겼던 동안 온 이벤트를 SSE만으로는 복구할 수 없기 때문)
          catchUp();
        }
      };

      source.onerror = () => {
        setConnected(false);
        source?.close();
        // EventSource 기본 재연결 대신 명시적으로 재시도 간격을 관리한다.
        reconnectTimer = setTimeout(connect, 2000);
      };

      source.addEventListener("display.changed", (e: MessageEvent) => {
        applyEvent(JSON.parse(e.data));
      });
    };

    // 탭이 백그라운드에 있다가 다시 보일 때, 브라우저가 타이머/네트워크를
    // 스로틀링했다가 풀어주는 시점이라 연결 상태가 실제와 다를 수 있다.
    // 다시 보이면 상태를 강제로 재확인한다.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") catchUp();
    };

    connect();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [applyEvent, catchUp, syncBaseline]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {event ? (
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
              SSE 연결 상태: {connected ? "연결됨" : "연결 안됨"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
