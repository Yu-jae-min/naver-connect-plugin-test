"use client";

import { useEffect, useState } from "react";
import { events } from "aws-amplify/data";
import {
  configureAppSyncEvents,
  getAppSyncConfigurationError,
} from "@/lib/appSyncEvents";
import styles from "./page.module.css";

type ConnectionStatus = "connecting" | "connected" | "error";
type Screen = "WAITING" | "MAIN";
type DisplayEvent = { type?: string; message?: string };

const CHANNEL = process.env.NEXT_PUBLIC_APPSYNC_CHANNEL ?? "/default/test";
const CONFIGURATION_ERROR = getAppSyncConfigurationError();

function getDisplayEvent(data: unknown): DisplayEvent | null {
  if (!data || typeof data !== "object") return null;

  // Amplify Events는 payload 자체를 전달한다. event wrapper를 반환하는 버전도 함께 허용한다.
  const value = "event" in data ? (data as { event: unknown }).event : data;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as DisplayEvent;
}

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus>(
    CONFIGURATION_ERROR ? "error" : "connecting",
  );
  const [screen, setScreen] = useState<Screen>("WAITING");
  const [message, setMessage] = useState(CONFIGURATION_ERROR);

  useEffect(() => {
    if (CONFIGURATION_ERROR) return;

    let disposed = false;
    let channel: Awaited<ReturnType<typeof events.connect>> | undefined;
    let subscription: ReturnType<
      Awaited<ReturnType<typeof events.connect>>["subscribe"]
    >;

    const connect = async () => {
      try {
        configureAppSyncEvents();
        channel = await events.connect(CHANNEL);

        if (disposed) {
          channel.close();
          return;
        }

        subscription = channel.subscribe({
          next: (data) => {
            const event = getDisplayEvent(data);
            if (event?.type !== "display.changed") return;

            setMessage(event.message ?? "화면 전환 이벤트를 수신했습니다.");
            // 중복 이벤트가 와도 대기 화면에서 한 번만 메인 UI로 전환한다.
            setScreen((current) => (current === "WAITING" ? "MAIN" : current));
          },
          error: (error) => {
            console.error("AppSync Events subscription failed", error);
            if (!disposed) {
              setMessage("AppSync 채널 구독 중 오류가 발생했습니다.");
              setStatus("error");
            }
          },
        });

        // SDK가 AppSync의 subscribe ACK를 받은 뒤에만 실제 수신 준비 완료로 표시한다.
        await subscription.ready;
        if (!disposed) setStatus("connected");
      } catch (error) {
        console.error("AppSync Events connection failed", error);
        if (!disposed) {
          setMessage(
            error instanceof Error
              ? error.message
              : "AppSync Events 연결에 실패했습니다.",
          );
          setStatus("error");
        }
      }
    };

    void connect();
    return () => {
      disposed = true;
      subscription?.unsubscribe();
      channel?.close();
    };
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          {screen === "MAIN" ? (
            <>
              <h1>메인 페이지</h1>
              <p>{message}</p>
            </>
          ) : (
            <>
              <h1>대기 화면</h1>
              <p>
                AppSync 고정 채널: {CHANNEL}
                <br />
                구독 상태:{" "}
                {status === "connected"
                  ? "연결됨"
                  : status === "connecting"
                    ? "연결 중"
                    : "연결 실패"}
                {message && (
                  <>
                    <br />
                    {message}
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
