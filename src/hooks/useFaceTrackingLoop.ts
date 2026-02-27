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

export function useFaceTrackingLoop({
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
  const lastUpdateRef = useRef(0);

  const [status, setStatus] = useState<PoseStatus>("none");
  const [inGuide, setInGuide] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!enabled || !video || !canvas || !landmarker) return;

    const loop = () => {
      if (video.readyState >= 2) {
        const w = video.videoWidth;
        const h = video.videoHeight;

        if (w > 0 && h > 0) {
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;

          const now = performance.now();
          const res = landmarker.detectForVideo(video, now);
          const lms = (res.faceLandmarks?.[0] ?? null) as NormalizedLandmark[] | null;

          const ftm = res.facialTransformationMatrixes?.[0]?.data;
          const pose = ftm ? getHeadPoseFromMatrix(ftm, yawSign) : null;

          if (frameRef) {
            const next: FaceFrame = {
              t: now,
              videoW: w,
              videoH: h,
              faceFound: !!lms,
              landmarks: lms ?? [],
              pose,
            };
            frameRef.current = next;
          }

          if (lms) {
            const guideOk = isFaceInsideGuide(lms);

            if (now - lastUpdateRef.current > 120) {
              setInGuide(guideOk);

              if (!guideOk) {
                setStatus("none");
              } else {
                if (ftm) setStatus(classifyPose(pose!));
                else setStatus("none");
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
  }, [enabled, yawSign, videoRef, canvasRef, landmarkerRef, frameRef]);

  return { status, inGuide };
}