// src/components/FaceLandmarks.tsx
import { useEffect, useMemo, useRef } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useUserMedia } from "@/hooks/useUserMedia";
import { useFaceLandmarker } from "@/hooks/useFaceLandmaker";

export default function FaceLandmarks() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

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
          drawLandmarks(canvas, res.faceLandmarks?.[0] ?? []);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cam.ready, mp.ready, mp.landmarkerRef]);

  if (cam.error) console.error("Camera error:", cam.error);
  if (mp.error) console.error("MediaPipe error:", mp.error);

return (
  <div className="grid place-items-center gap-3">
    <div className="relative w-[min(900px,95vw)]">
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-auto w-full -scale-x-100"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
      />
    </div>
    <div className="text-[13px] opacity-70">랜드마크 점만 표시</div>
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