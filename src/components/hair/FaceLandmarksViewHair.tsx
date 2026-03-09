import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayTransform, type NLM } from "@/hooks/hair/useOverlayTransform";

const hairMeta = {
  img: "/hair/0.png",
  size: { w: 501, h: 457 },
  anchor: { x: 250, y: 280 },
  baseEyePx: 220,
  offsetPx: { x: -900, y: 40 },
};

type PoseNorm = { x: number; y: number; z: number };

function buildFramePayload(
  userId: string,
  poseNorm: PoseNorm | null,
  landmarks: NLM[] | null
) {
  if (!poseNorm || !landmarks || landmarks.length === 0 || !landmarks[10]) {
    return null;
  }

  return {
    user_id: userId,
    angle: {
      pitch: poseNorm.x,
      yaw: poseNorm.y,
      roll: poseNorm.z,
    },
    forehead: {
      x: landmarks[10].x,
      y: landmarks[10].y,
      z: landmarks[10].z ?? 0,
    },
    landmark: landmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z ?? 0,
    })),
  };
}

export default function FaceLandmarksViewHair({
  videoRef,
  canvasRef,
  poseNorm,
  landmarks,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  poseNorm: PoseNorm | null;
  landmarks: NLM[] | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const userId = "user-123";

  const hash = useMemo(() => {
    if (!poseNorm) return null;
    return poseNorm.x * 360 ** 2 + poseNorm.y * 360 + poseNorm.z;
  }, [poseNorm]);

  const overlaySrc = useMemo(() => {
    if (hash == null) return null;
    return `/hair/0.png`;
  }, [hash]);

  const [overlayOk, setOverlayOk] = useState(true);
  useEffect(() => setOverlayOk(true), [overlaySrc]);

  const overlayTransform = useOverlayTransform({
    wrapRef,
    videoRef,
    landmarks,
    baseEyePx: hairMeta.baseEyePx,
    pngAnchor: hairMeta.anchor,
    offsetPx: hairMeta.offsetPx,
  });

  const hairPos = useMemo(() => {
    if (!overlayTransform) return null;

    const m = overlayTransform.match(
      /translate\(\s*([-0-9.]+)px,\s*([-0-9.]+)px\)/i
    );
    if (!m) return null;

    return { x: Number(m[1]), y: Number(m[2]) };
  }, [overlayTransform]);

  useEffect(() => {
    const payload = buildFramePayload(userId, poseNorm, landmarks);
    if (!payload) return;

    const send = async () => {
      try {
        // await fetch("/api/frame", {
        //   method: "POST",
        //   headers: {
        //     "Content-Type": "application/json",
        //   },
        //   body: JSON.stringify(payload),
        // });
      } catch (err) {
        console.error("frame 전송 실패:", err);
      }
    };

    send();
  }, [poseNorm, landmarks]);

  const lmText = useMemo(() => {
    if (!landmarks || landmarks.length === 0) return "landmarks: -";

    const forehead = landmarks[10];
    if (!forehead) return "forehead(10): -";

    return [
      `landmarks: ${landmarks.length}`,
      ` 10 (이마): x=${forehead.x.toFixed(4)} y=${forehead.y.toFixed(4)} z=${(forehead.z ?? 0).toFixed(4)}`,
    ].join("\n");
  }, [landmarks]);

  return (
    <div className="grid place-items-center">
      <div ref={wrapRef} className="relative w-[min(900px,95vw)]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-auto w-full -scale-x-100"
        />

        {overlaySrc && overlayOk && overlayTransform && (
          <div
            className="pointer-events-none absolute left-0 top-0 -scale-x-100"
            style={{ transformOrigin: "0 0", transform: overlayTransform }}
          >
            <img
              src={hairMeta.img}
              alt=""
              style={{
                width: hairMeta.size.w,
                height: hairMeta.size.h,
                opacity: 0.92,
              }}
              onError={() => setOverlayOk(false)}
            />

            <div
              style={{
                position: "absolute",
                left: hairMeta.anchor.x - 4,
                top: hairMeta.anchor.y - 4,
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: "red",
              }}
            />
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
        />
      </div>

      <div className="mt-3 w-[min(900px,95vw)] rounded-lg border bg-black/60 px-4 py-2 text-sm text-white">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {poseNorm ? (
            <>
              <div>
                X(pitch): <b>{poseNorm.x}</b>°
              </div>
              <div>
                Y(yaw): <b>{poseNorm.y}</b>°
              </div>
              <div>
                Z(roll): <b>{poseNorm.z}</b>°
              </div>
              <div>
                해쉬: <b>{hash}</b>
              </div>
              <div className="opacity-80">
                img: <b>{overlayOk ? overlaySrc : "없음"}</b>
              </div>
              <div className="opacity-80">
                transform: <b>{overlayTransform ? "OK" : "-"}</b>
              </div>
            </>
          ) : (
            <div className="opacity-70">각도: -</div>
          )}
        </div>

        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs leading-5">
          {lmText}
        </pre>

        <div className="opacity-80">
          hair pos:{" "}
          <b>{hairPos ? `x=${hairPos.x.toFixed(1)}, y=${hairPos.y.toFixed(1)}` : "-"}</b>
        </div>
      </div>
    </div>
  );
}