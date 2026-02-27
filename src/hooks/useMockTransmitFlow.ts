import { useEffect, useRef, useState } from "react";
import type { FaceFrame, PoseStatus } from "@/lib/face/types";
import { downloadJsonFile } from "@/lib/face/downloadJson";

export type TxPhase = "idle" | "sending" | "done";

export function useMockTransmitFlow({
  userId,
  status,
  inGuide,
  frameRef,
  autoDownloadOnDone = true,
}: {
  userId: string;
  status: PoseStatus;
  inGuide: boolean;
  frameRef: React.RefObject<FaceFrame | null>;
  autoDownloadOnDone?: boolean;
}) {
  const [phase, setPhase] = useState<TxPhase>("idle");

  const frontSinceRef = useRef<number | null>(null);
  const leftSeenRef = useRef(false);
  const rightSeenRef = useRef(false);
  const seqRef = useRef(0);

  const guardTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  // ✅ 로그 누적용
  const logRef = useRef<Record<string, any>>({});
  const sendingStartRef = useRef<number | null>(null);

  const downloadLog = () => {
    const filename = `face_stream_${userId}_${new Date()
      .toISOString()
      .replaceAll(":", "-")}.json`;

    downloadJsonFile(logRef.current, filename);
  };

  // 1) 정면 3초 유지 → sending 시작
  useEffect(() => {
    if (phase !== "idle") return;

    guardTimerRef.current = window.setInterval(() => {
      const now = performance.now();

      if (inGuide && status === "front") {
        if (frontSinceRef.current == null) frontSinceRef.current = now;

        if (now - frontSinceRef.current >= 3000) {
          setPhase("sending");
          leftSeenRef.current = false;
          rightSeenRef.current = false;

          // ✅ 로그 초기화
          seqRef.current = 0;
          sendingStartRef.current = performance.now();
          logRef.current = { userid: userId };
        }
      } else {
        frontSinceRef.current = null;
      }
    }, 100);

    return () => {
      if (guardTimerRef.current) window.clearInterval(guardTimerRef.current);
      guardTimerRef.current = null;
    };
  }, [phase, inGuide, status, userId]);

  // 2) sending 중 좌/우 1번씩 인식 → done
  useEffect(() => {
    if (phase !== "sending") return;

    if (inGuide && status === "left") leftSeenRef.current = true;
    if (inGuide && status === "right") rightSeenRef.current = true;

    if (leftSeenRef.current && rightSeenRef.current) {
      setPhase("done");
    }
  }, [phase, status, inGuide]);

  useEffect(() => {
    if (phase !== "sending") {
      if (sendTimerRef.current) window.clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
      return;
    }

    sendTimerRef.current = window.setInterval(() => {
      const frame = frameRef.current;
      seqRef.current += 1;

      const elapsed = seqRef.current * 1000; // ✅ "100", "200", ... 키로 사용

      const payload = {
        seq: seqRef.current,
        ts: Date.now(),
        elapsedMs: elapsed,
        status,
        inGuide,
        progress: {
          leftSeen: leftSeenRef.current,
          rightSeen: rightSeenRef.current,
        },
        frame: frame
          ? {
              t: frame.t,
              videoW: frame.videoW,
              videoH: frame.videoH,
              faceFound: frame.faceFound,
              pose: frame.pose,
              landmarks: frame.landmarks.map((p) => [p.x, p.y, p.z]),
            }
          : null,
      };

      console.log("[MOCK] POST /face-stream", payload);

      logRef.current[String(elapsed)] = payload;
    }, 1000);

    return () => {
      if (sendTimerRef.current) window.clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
    };
  }, [phase, frameRef, status, inGuide]);

  // 4) done 시 다운로드(옵션)
  useEffect(() => {
    if (phase !== "done") return;

    if (sendTimerRef.current) window.clearInterval(sendTimerRef.current);
    sendTimerRef.current = null;

    if (autoDownloadOnDone) downloadLog();
  }, [phase, autoDownloadOnDone]);

  return {
    phase,
    message:
      phase === "sending"
        ? "얼굴정보를 전송합니다"
        : phase === "done"
        ? "전송 완료"
        : "",
    leftSeen: leftSeenRef.current,
    rightSeen: rightSeenRef.current,
    downloadLog, // ✅ 수동 다운로드 버튼도 가능
  };
}