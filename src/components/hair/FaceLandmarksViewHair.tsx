// components/hair/FaceLandmarksViewHair.tsx
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayTransform, type NLM } from "@/hooks/hair/useOverLayTransform";

const hairMeta = {
  img: "/hair/0.png",
  size: { w: 501, h: 457 },
  anchor: { x: 250, y: 280 }, // 일단 임시(아래 설명)
  baseEyePx: 220,
  offsetPx: { x: -900, y: 40 },
};

export default function FaceLandmarksViewHair({
  videoRef,
  canvasRef,
  poseNorm,
  landmarks,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  poseNorm: { x: number; y: number; z: number } | null;
  landmarks: NLM[] | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

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
    baseEyePx: hairMeta.baseEyePx, // 220이든 260이든 너가 기준으로 잡아
    pngAnchor: hairMeta.anchor,
    offsetPx: hairMeta.offsetPx, 
  });
const hairPos = useMemo(() => {
  if (!overlayTransform) return null;

  // overlayTransform = "translate(${tx}px, ${ty}px) rotate(...) scale(...)"
  const m = overlayTransform.match(
    /translate\(\s*([-0-9.]+)px,\s*([-0-9.]+)px\)/i
  );
  if (!m) return null;

  return { x: Number(m[1]), y: Number(m[2]) };
}, [overlayTransform]);

  const samplePoints = [
    { i: 1, label: "코" },
    { i: 33, label: "왼쪽 눈" },
    { i: 263, label: "오른쪽 눈" },
    { i: 61, label: "입 왼쪽 끝" },
    { i: 291, label: "입 오른쪽 끝" },
    { i: 10, label: "이마" },
    { i: 152, label: "턱 끝" },
  ];

  const lmText = useMemo(() => {
    if (!landmarks || landmarks.length === 0) return "landmarks: -";

    const lines: string[] = [];
    lines.push(`landmarks: ${landmarks.length}`);
    for (const { i, label } of samplePoints) {
      const lm = landmarks[i];
      if (!lm) continue;
      const z = lm.z ?? 0;
      lines.push(
        `${String(i).padStart(3, " ")} (${label}): x=${lm.x.toFixed(4)} y=${lm.y.toFixed(
          4
        )} z=${z.toFixed(4)}`
      );
    }
    return lines.join("\n");
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
            style={{ width: hairMeta.size.w, height: hairMeta.size.h, opacity: 0.92 }}
            onError={() => setOverlayOk(false)}
          />

          {/* ✅ 앵커 점 표시 */}
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