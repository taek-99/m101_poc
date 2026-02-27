import { useEffect, useRef, useState } from "react";
import type { FaceFrame, PoseStatus } from "@/lib/face/types";
import { downloadJsonFile } from "@/lib/face/downloadJson";

export type TxPhase = "idle" | "sending" | "done";

type FramePayload = {
  t: number;
  status: PoseStatus;
  inGuide: boolean;
  faceFound: boolean;
  pose: FaceFrame["pose"];
  landmarks: number[][]; // [[x,y,z], ...] (모든 점)
};

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

  // ✅ 기록용
  const logRef = useRef<Record<string, any>>({});
  const bufferRef = useRef<FramePayload[]>([]);
  const startPerfRef = useRef<number | null>(null);
  const bucketIndexRef = useRef(0);

  // ✅ 타이머/RAF
  const guardTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const rafIdRef = useRef<number | null>(null);

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
          // ✅ sending 시작
          setPhase("sending");
          leftSeenRef.current = false;
          rightSeenRef.current = false;

          // ✅ 로그 초기화
          startPerfRef.current = performance.now();
          bucketIndexRef.current = 0;
          bufferRef.current = [];
          logRef.current = {
            userid: userId,
            startedAtTs: Date.now(),
          };
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

  // 3) ✅ 프레임마다 저장(버퍼에 쌓기) — rAF
  useEffect(() => {
    if (phase !== "sending") return;

    const tick = () => {
      const f = frameRef.current;
      if (f) {
        bufferRef.current.push({
          t: f.t,
          status,
          inGuide,
          faceFound: f.faceFound,
          pose: f.pose,
          landmarks: f.landmarks.map((p) => [p.x, p.y, p.z]),
        });
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    };
  }, [phase, frameRef, status, inGuide]);

  // 4) ✅ 1초마다 JSON 객체에 “버킷”으로 추가(flush)
  useEffect(() => {
    if (phase !== "sending") return;

    flushTimerRef.current = window.setInterval(() => {
      bucketIndexRef.current += 1;
      const key = String(bucketIndexRef.current * 1000); // "1000","2000",...

      const chunk = bufferRef.current;
      bufferRef.current = [];

      // 1초 동안 모인 프레임들을 한 덩어리로 추가
      logRef.current[key] = {
        bucketMs: Number(key),
        frameCount: chunk.length,
        progress: {
          leftSeen: leftSeenRef.current,
          rightSeen: rightSeenRef.current,
        },
        frames: chunk,
      };

      console.log(`[MOCK] flushed bucket ${key}ms (frames=${chunk.length})`);
    }, 1000);

    return () => {
      if (flushTimerRef.current) window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    };
  }, [phase]);

  // 5) done 시: 남은 버퍼 flush + 다운로드
  useEffect(() => {
    if (phase !== "done") return;

    // stop timers
    if (flushTimerRef.current) window.clearInterval(flushTimerRef.current);
    flushTimerRef.current = null;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;

    // ✅ 마지막 남은 프레임 버퍼도 flush
    if (bufferRef.current.length > 0) {
      bucketIndexRef.current += 1;
      const key = String(bucketIndexRef.current * 1000);

      const chunk = bufferRef.current;
      bufferRef.current = [];

      logRef.current[key] = {
        bucketMs: Number(key),
        frameCount: chunk.length,
        progress: {
          leftSeen: leftSeenRef.current,
          rightSeen: rightSeenRef.current,
        },
        frames: chunk,
      };

      console.log(`[MOCK] flushed final bucket ${key}ms (frames=${chunk.length})`);
    }

    logRef.current.endedAtTs = Date.now();

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
    downloadLog,
  };
}