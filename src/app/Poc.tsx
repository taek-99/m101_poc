// components/FaceLandmarks.tsx
import { useMemo, useRef } from "react";
import { useUserMedia } from "@/hooks/post/useUserMedia";
import { useFaceLandmarker } from "@/hooks/post/useFaceLandmarker";
import { useFaceTrackingLoopHair } from "@/hooks/hair/useFaceTrackingLoopHair";
import FaceLandmarksViewHair from "@/components/hair/FaceLandmarksViewHair";
import { useFaceTrackingLoopPoc } from "@/hooks/poc/useFaceTrackingLoopPoc";
import FaceLandmarksViewPoc from "@/components/poc/FaceLandmarksViewPoc";

export default function Poc() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const modelPath = useMemo(
    () => `${import.meta.env.BASE_URL}models/face_landmarker.task`,
    []
  );

  const cam = useUserMedia({ videoEl: videoRef.current });

  const mp = useFaceLandmarker({
    modelAssetPath: modelPath,
    wasmBaseUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  });

  // ✅ landmarks도 같이 받기
  const { poseNorm, landmarks } = useFaceTrackingLoopPoc({
    videoRef,
    canvasRef,
    landmarkerRef: mp.landmarkerRef,
    enabled: cam.ready && mp.ready,
    yawSign: 1,
  });

  return (
  <FaceLandmarksViewPoc
    videoRef={videoRef}
    canvasRef={canvasRef}
    poseNorm={poseNorm}
    landmarks={landmarks}
  />
  );
}