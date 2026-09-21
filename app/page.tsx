"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

// SSE 연결 상태를 하나의 값으로 표현.
// connected/connecting 두 boolean으로 나누면 "연결 실패(error)"와
// "아직 연결 시도 전(connecting)" 상태가 둘 다 connected=false로 겹쳐서
// 구분이 안 되는 문제가 있었음 (에러 발생 시에도 스피너가 계속 노출됨).
type ConnectionStatus = "connecting" | "connected" | "error";

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [event, setEvent] = useState<{
    message: string;
    receivedAt: string;
  } | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/connect/events");

    source.onopen = () => {
      setStatus("connected");
    };
    source.onerror = () => {
      // 연결 실패/끊김. connecting=false, connected=false로 뭉개지 않고
      // "error"로 명시해 화면에서 "연결 안됨"을 바로 표시할 수 있게 함.
      setStatus("error");
    };

    source.addEventListener("display.changed", (e: MessageEvent) => {
      setEvent(JSON.parse(e.data));
    });

    return () => source.close();
  }, []);

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
