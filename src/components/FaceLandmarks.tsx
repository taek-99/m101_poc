import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useUserMedia } from "@/hooks/useUserMedia";
import { useFaceLandmarker } from "@/hooks/useFaceLandmarker";
import AlignmentGuide from "./AlignmentGuide";
import * as THREE from "three";

type PoseStatus = "none" | "front" | "left" | "right";

export default function FaceLandmarks() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<PoseStatus>("none");
  const lastUpdateRef = useRef(0);
  const [inGuide, setInGuide] = useState(false);

  const YAW_SIGN = -1;

  const modelPath = useMemo(
    () => `${import.meta.env.BASE_URL}models/face_landmarker.task`,
    []
  );

  const cam = useUserMedia({ videoEl: videoRef.current });

  const mp = useFaceLandmarker({
    modelAssetPath: modelPath,
    wasmBaseUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = mp.landmarkerRef.current;

    if (!video || !canvas || !landmarker) return;
    if (!cam.ready || !mp.ready) return;

    const loop = () => {
      if (video.readyState >= 2) {
        const w = video.videoWidth;
        const h = video.videoHeight;

        if (w > 0 && h > 0) {
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;

          const res = landmarker.detectForVideo(video, performance.now());
          const lms = res.faceLandmarks?.[0] ?? null;

          const now = performance.now();

          if (lms) {
            const guideOk = isFaceInsideGuide(lms);

            // 120ms마다만 상태 갱신(렌더 과다 방지)
            if (now - lastUpdateRef.current > 120) {
              setInGuide(guideOk);

              if (!guideOk) {
                setStatus("none");
              } else {
                const ftm = res.facialTransformationMatrixes?.[0]?.data;
                if (ftm) {
                  const pose = getHeadPoseFromMatrix(ftm, YAW_SIGN);
                  setStatus(classifyPose(pose));
                } else {
                  setStatus("none");
                }
              }

              lastUpdateRef.current = now;
            }

            drawLandmarks(canvas, lms);
          } else {
            if (now - lastUpdateRef.current > 200) {
              setInGuide(false);
              setStatus("none");
              lastUpdateRef.current = now;
            }
            drawLandmarks(canvas, []);
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cam.ready, mp.ready]);

  return (
    <div className="grid place-items-center gap-3">
      <div className="relative w-[min(900px,95vw)]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-auto w-full -scale-x-100"
        />

        <AlignmentGuide className="-scale-x-100" status={status} />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
        />
      </div>

      <div className="text-sm font-semibold">
        {!inGuide && (
          <span className="text-gray-500">가이드 안에 얼굴을 맞춰주세요</span>
        )}
        {inGuide && status === "front" && (
          <span className="text-blue-500">정면 인식 성공</span>
        )}
        {inGuide && status === "right" && (
          <span className="text-blue-500">오른쪽 인식 성공</span>
        )}
        {inGuide && status === "left" && (
          <span className="text-blue-500">왼쪽 인식 성공</span>
        )}
        {inGuide && status === "none" && (
          <span className="text-gray-500">고개를 맞춰주세요</span>
        )}
      </div>
    </div>
  );
}

function drawLandmarks(canvas: HTMLCanvasElement, landmarks: NormalizedLandmark[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0, 255, 0, 0.9)";
  const r = 2;

  for (const p of landmarks) {
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

function getHeadPoseFromMatrix(matrixData: ArrayLike<number>, yawSign = 1) {
  const m = new THREE.Matrix4().fromArray(Array.from(matrixData));
  const e = new THREE.Euler().setFromRotationMatrix(m);

  const pitch = radToDeg(e.x);
  const yaw = radToDeg(e.y) * yawSign;
  const roll = radToDeg(e.z);

  return { yaw, pitch, roll };
}

function classifyPose(p: { yaw: number; pitch: number; roll: number }): PoseStatus {
  const { yaw, pitch, roll } = p;

  const FRONT =
    Math.abs(yaw) < 12 && Math.abs(pitch) < 12 && Math.abs(roll) < 15;
  if (FRONT) return "front";

  const SIDE_OK = Math.abs(pitch) < 20 && Math.abs(roll) < 25;

  if (SIDE_OK && yaw > 35 && yaw < 95) return "right";
  if (SIDE_OK && yaw < -35 && yaw > -95) return "left";

  return "none";
}

/** =========================
 *  ✅ B안: 가이드 판정 더 빡빡하게
 *  - 앵커 7개
 *  - 타원 shrink(0.88)
 *  - 7개 중 6개 이상 들어와야 통과
 *  ========================= */

const GUIDE_VIEW = { w: 1000, h: 562 };
const GUIDE_FACE = { cx: 500, cy: 190, rx: 120, ry: 150 };

// 10(이마쪽), 1(코), 33/263(눈 바깥), 61/291(입꼬리), 152(턱)
const FACE_ANCHORS = [10, 1, 33, 263, 61, 291, 152] as const;

const STRICT = {
  shrink: 0.88,
  minInside: 6,
};

function inEllipse(
  x: number,
  y: number,
  e: { cx: number; cy: number; rx: number; ry: number }
) {
  const dx = (x - e.cx) / e.rx;
  const dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}

function isFaceInsideGuide(landmarks: NormalizedLandmark[]) {
  const e = {
    cx: GUIDE_FACE.cx,
    cy: GUIDE_FACE.cy,
    rx: GUIDE_FACE.rx * STRICT.shrink,
    ry: GUIDE_FACE.ry * STRICT.shrink,
  };

  let inside = 0;

  for (const idx of FACE_ANCHORS) {
    const lm = landmarks[idx];
    if (!lm) continue;

    const gx = lm.x * GUIDE_VIEW.w;
    const gy = lm.y * GUIDE_VIEW.h;

    if (inEllipse(gx, gy, e)) inside++;
  }

  return inside >= STRICT.minInside;
}