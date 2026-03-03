import { useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { drawLandmarks } from "@/lib/face/draw";
import { isFaceInsideGuide } from "@/lib/face/guide";
import { classifyPose, getHeadPoseFromMatrix } from "@/lib/face/pose";
import type { FaceFrame, PoseStatus } from "@/lib/face/types";
import { makeUpperOvalRingIdxs } from "@/lib/face/scalpRing";

import { createBaldThree } from "@/hooks/bald/createBaldThree";
import { initHairSegmenter, getHairSegmenter } from "@/lib/segmentation/hairSegmenter";

type LandmarkerLike = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => any;
};

const FRAME_INTERVAL = 1000 / 30;
const SEG_INTERVAL = 1000 / 12;

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

export function useFaceTrackingLoopBald({
  videoRef,
  canvasRef,
  threeCanvasRef,
  landmarkerRef,
  enabled,
  yawSign = 1,
  frameRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  threeCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  landmarkerRef: React.RefObject<LandmarkerLike | null>;
  enabled: boolean;
  yawSign?: number;
  frameRef?: React.RefObject<FaceFrame | null>;
}) {
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const lastSegRef = useRef(0);

  const [status, setStatus] = useState<PoseStatus>("none");
  const [inGuide, setInGuide] = useState(false);

  const baldThreeRef = useRef<ReturnType<typeof createBaldThree> | null>(null);
  const segInitOnceRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas2D = canvasRef.current;
    const canvas3D = threeCanvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!enabled || !video || !canvas2D || !canvas3D || !landmarker) return;

    if (!segInitOnceRef.current) {
      segInitOnceRef.current = true;
      void initHairSegmenter();
    }

    if (!baldThreeRef.current) {
      baldThreeRef.current = createBaldThree(canvas3D);
    }

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      if (video.readyState < 2) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w <= 0 || h <= 0) return;

      const now = performance.now();
      if (now - lastDetectRef.current < FRAME_INTERVAL) return;
      lastDetectRef.current = now;

      syncCanvasSize(video, canvas2D);
      baldThreeRef.current?.resize(w, h);

      // 1) Face Landmarks
      const res = landmarker.detectForVideo(video, now);
      const lms = (res.faceLandmarks?.[0] ?? null) as NormalizedLandmark[] | null;

      const ftm = res.facialTransformationMatrixes?.[0]?.data;
      const pose = ftm ? getHeadPoseFromMatrix(ftm, yawSign) : null;

      updateFrameRef(frameRef, now, w, h, lms, pose);

      // 2) status/inGuide
      if (lms) {
        const guideOk = isFaceInsideGuide(lms);
        if (now - lastUpdateRef.current > 120) {
          setInGuide(guideOk);
          setStatus(guideOk && ftm && pose ? classifyPose(pose) : "none");
          lastUpdateRef.current = now;
        }
      } else {
        if (now - lastUpdateRef.current > 200) {
          setInGuide(false);
          setStatus("none");
          lastUpdateRef.current = now;
        }
      }

      // 3) Hair segmentation 먼저 (throttle)
      const seg = getHairSegmenter();
      if (seg && now - lastSegRef.current > SEG_INTERVAL) {
        lastSegRef.current = now;
        try {
          const segRes: any = seg.segmentForVideo(video, now);
          const cm = segRes?.categoryMask;

          if (cm) {
            const mw = cm.width as number;
            const mh = cm.height as number;

            const raw: Uint8Array | Float32Array =
              typeof cm.getAsUint8Array === "function"
                ? (cm.getAsUint8Array() as Uint8Array)
                : (cm.getAsFloat32Array?.() as Float32Array);

            if (raw && mw > 0 && mh > 0) {
              const mask01 = new Uint8ClampedArray(mw * mh);
              if (raw instanceof Uint8Array) {
                for (let i = 0; i < mw * mh; i++) mask01[i] = raw[i] > 0 ? 1 : 0;
              } else {
                for (let i = 0; i < mw * mh; i++) mask01[i] = raw[i] > 0.5 ? 1 : 0;
              }
              baldThreeRef.current?.updateHairMask(mask01, mw, mh);
            }
          }
        } catch {
          // ignore
        }
      }

      // 4) 2D 디버그 렌더 (video는 video 태그가 보여주는 전제)
      const ctx = canvas2D.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      // drawLandmarks(canvas2D, lms ?? []);
      // baldThreeRef.current?.debugDrawHairMaskTo(ctx, w, h);

      // 5) 링 디버그 + 3D 업데이트
      if (lms) {
        const ringIdxs = makeUpperOvalRingIdxs(lms, 0.55);
        ctx.save();
        ctx.fillStyle = "red";
        for (const idx of ringIdxs) {
          const p = lms[idx];
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        baldThreeRef.current?.update(lms, w, h);
      }
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      baldThreeRef.current?.dispose();
      baldThreeRef.current = null;
    };
  }, [enabled, yawSign, videoRef, canvasRef, threeCanvasRef, landmarkerRef, frameRef]);

  return { status, inGuide };
}