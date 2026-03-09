// hooks/useFaceTrackingLoop.ts
import { useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { drawLandmarks } from "@/lib/face/draw";
import { isFaceInsideGuide } from "@/lib/face/guide";
import { classifyPose, getHeadPoseFromMatrix } from "@/lib/face/pose";
import type { FaceFrame, PoseStatus } from "@/lib/face/types";

type LandmarkerLike = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => any;
};

const FRAME_INTERVAL = 1000 / 30;

function syncCanvasSize(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
}

function updateFrameRef(
  frameRef: React.RefObject<FaceFrame | null> | undefined,
  now: number,
  w: number,
  h: number,
  lms: NormalizedLandmark[] | null,
  pose: FaceFrame["pose"]
) {
  if (!frameRef) return;
  frameRef.current = {
    t: now,
    videoW: w,
    videoH: h,
    faceFound: !!lms,
    landmarks: lms ?? [],
    pose,
  };
}

// ✅ -180~180, 0~360 등 어떤 값이 와도 0~359 정수로 정규화
function normDeg0to359(deg: number) {
  const d = ((deg % 360) + 360) % 360;
  return Math.round(d);
}

type PoseNorm = { x: number; y: number; z: number } | null;

function drawRedPoints(
  canvas: HTMLCanvasElement,
  lms: NormalizedLandmark[],
  idxs: number[]
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.fillStyle = "red";

  for (const i of idxs) {
    const p = lms[i];
    if (!p) continue;

    const x = p.x * w;
    const y = p.y * h;

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2); // 점 크기
    ctx.fill();
  }

  ctx.restore();
}

export function useFaceTrackingLoopHair({
  videoRef,
  canvasRef,
  landmarkerRef,
  enabled,
  yawSign = 1,
  frameRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  landmarkerRef: React.RefObject<LandmarkerLike | null>;
  enabled: boolean;
  yawSign?: number;
  frameRef?: React.RefObject<FaceFrame | null>;
}) {
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const lastUpdateRef = useRef(0);

  const [status, setStatus] = useState<PoseStatus>("none");
  const [inGuide, setInGuide] = useState(false);

  // ✅ 화면 표시용 정규화 각도
  const [poseNorm, setPoseNorm] = useState<PoseNorm>(null);

  // ✅ 추가: 화면 표시용 landmarks
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!enabled || !video || !canvas || !landmarker) return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      if (video.readyState < 2) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w <= 0 || h <= 0) return;

      const now = performance.now();
      if (now - lastDetectRef.current < FRAME_INTERVAL) return;
      lastDetectRef.current = now;

      syncCanvasSize(video, canvas);

      const res = landmarker.detectForVideo(video, now);
      const lms = (res.faceLandmarks?.[0] ?? null) as NormalizedLandmark[] | null;

      const ftm = res.facialTransformationMatrixes?.[0]?.data;
      const pose = ftm ? getHeadPoseFromMatrix(ftm, yawSign) : null;

      updateFrameRef(frameRef, now, w, h, lms, pose);

      if (lms) {
        const guideOk = isFaceInsideGuide(lms);

        // ✅ 120ms마다 UI 갱신
        if (now - lastUpdateRef.current > 120) {
          setInGuide(guideOk);
          setStatus(guideOk && ftm && pose ? classifyPose(pose) : "none");

          // ✅ landmarks도 UI로 올림
          setLandmarks(lms);

          // ✅ pose가 있으면 x,y,z를 0~359로 정규화해서 표시
          if (pose) {
            const x = (pose as any).pitch ?? (pose as any).x ?? 0;
            const y = (pose as any).yaw ?? (pose as any).y ?? 0;
            const z = (pose as any).roll ?? (pose as any).z ?? 0;

            setPoseNorm({
              x: normDeg0to359(x),
              y: normDeg0to359(y),
              z: normDeg0to359(z),
            });
          } else {
            setPoseNorm(null);
          }

          lastUpdateRef.current = now;
        }
      } else {
        if (now - lastUpdateRef.current > 200) {
          setInGuide(false);
          setStatus("none");
          setPoseNorm(null);

          // ✅ 얼굴 없어지면 landmarks도 비움
          setLandmarks(null);

          lastUpdateRef.current = now;
        }
      }

      drawLandmarks(canvas, lms ?? []);

      if (lms) {
        drawRedPoints(canvas, lms, [10]);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, yawSign, videoRef, canvasRef, landmarkerRef, frameRef]);

  // ✅ landmarks도 같이 반환
  return { status, inGuide, poseNorm, landmarks };
}