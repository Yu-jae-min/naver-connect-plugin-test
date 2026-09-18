"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState<{
    message: string;
    receivedAt: string;
  } | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/connect/events");

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.addEventListener("display.changed", (e: MessageEvent) => {
      setEvent(JSON.parse(e.data));
    });

    return () => source.close();
  }, []);

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
