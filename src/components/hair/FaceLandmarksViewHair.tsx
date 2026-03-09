import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayTransform, type NLM } from "@/hooks/hair/useOverlayTransform";

const hairMeta = {
  img: "/hair/0.png",
  size: { w: 300, h: 300 },
  anchor: { x: 150, y: 280 },
  baseEyePx: 220,
  offsetPx: { x: -850, y: 40 },
};

type PoseNorm = { x: number; y: number; z: number };

/**
 * 좌우 crop 비율
 * 예: 0.18이면 왼쪽 18%, 오른쪽 18% 잘라냄
 */
const CROP_LEFT = 0.18;
const CROP_RIGHT = 0.18;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * 원본 normalized x(0~1)를
 * 잘라낸 새 viewport 기준 x(0~1)로 변환
 */
function cropX(x: number, leftCut: number, rightCut: number) {
  const visible = 1 - leftCut - rightCut;
  return clamp01((x - leftCut) / visible);
}

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
    return "/hair/0.png";
  }, [hash]);

  const [overlayOk, setOverlayOk] = useState(true);
  useEffect(() => setOverlayOk(true), [overlaySrc]);

  /**
   * overlay 계산용 landmark
   * -> crop된 viewport 기준 x로 재매핑
   */
  const croppedLandmarks = useMemo(() => {
    if (!landmarks) return null;

    return landmarks.map((lm) => ({
      ...lm,
      x: cropX(lm.x, CROP_LEFT, CROP_RIGHT),
    }));
  }, [landmarks]);

  const overlayTransform = useOverlayTransform({
    wrapRef,
    videoRef,
    landmarks: croppedLandmarks,
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
        // console.log(JSON.stringify(payload));
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
      ` 10 (이마): x=${forehead.x.toFixed(4)} y=${forehead.y.toFixed(4)} z=${(
        forehead.z ?? 0
      ).toFixed(4)}`,
    ].join("\n");
  }, [landmarks]);

  /**
   * video/canvas를 같이 crop해서 보여주기 위한 style
   * 보이는 영역 = 1 - CROP_LEFT - CROP_RIGHT
   */
  const visibleRatio = 1 - CROP_LEFT - CROP_RIGHT;
  const zoomPercent = 100 / visibleRatio;
  const shiftPercent = (CROP_LEFT / visibleRatio) * 100;

  return (
    <div className="grid place-items-center">
      <div
        ref={wrapRef}
        className="relative w-[min(900px,95vw)] overflow-hidden bg-black"
      >
        {/* video + canvas는 같은 crop 레이어 안에 넣어서 같이 잘리게 */}
        <div
          className="relative"
          style={{
            width: `${zoomPercent}%`,
            marginLeft: `-${shiftPercent}%`,
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="block h-auto w-full -scale-x-100"
          />

          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
          />
        </div>

        {/* overlay는 crop된 viewport 기준으로 따로 계산 */}
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
          <b>
            {hairPos ? `x=${hairPos.x.toFixed(1)}, y=${hairPos.y.toFixed(1)}` : "-"}
          </b>
        </div>

        <div className="opacity-80">
          crop: <b>left {Math.round(CROP_LEFT * 100)}%</b>,{" "}
          <b>right {Math.round(CROP_RIGHT * 100)}%</b>
        </div>
      </div>
    </div>
  );
}