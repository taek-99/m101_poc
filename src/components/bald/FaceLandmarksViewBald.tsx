// components/FaceLandmarksViewBald.tsx
import type { RefObject } from "react";

export default function FaceLandmarksViewBald({
  videoRef,
  canvasRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <div className="grid place-items-center">
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
    </div>
  );
}