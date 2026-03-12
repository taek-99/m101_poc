import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/poc/Modal";
import { HairSelector } from "@/components/poc/HairSelector";

type PoseNorm = { x: number; y: number; z: number };

type HairItem = {
  id: number;
  img: string;
  thumb: string;
  label: string;
  size: { w: number; h: number };
  anchor: { x: number; y: number };
  baseEyePx: number;
  offsetPx: { x: number; y: number };
};

const HAIR_ITEMS: HairItem[] = [
  {
    id: 0,
    img: "",
    thumb: "",
    label: "없음",
    size: { w: 300, h: 300 },
    anchor: { x: 150, y: 280 },
    baseEyePx: 220,
    offsetPx: { x: 0, y: 0 },
  },
  {
    id: 1,
    img: "/hair/0.png",
    thumb: "/hair/0.png",
    label: "헤어 1",
    size: { w: 300, h: 300 },
    anchor: { x: 150, y: 280 },
    baseEyePx: 220,
    offsetPx: { x: -850, y: 40 },
  },
  {
    id: 2,
    img: "/hair/1.png",
    thumb: "/hair/1.png",
    label: "헤어 2",
    size: { w: 300, h: 300 },
    anchor: { x: 150, y: 280 },
    baseEyePx: 220,
    offsetPx: { x: -850, y: 40 },
  },
  {
    id: 3,
    img: "/hair/2.png",
    thumb: "/hair/2.png",
    label: "헤어 3",
    size: { w: 300, h: 300 },
    anchor: { x: 150, y: 280 },
    baseEyePx: 220,
    offsetPx: { x: -850, y: 40 },
  },
  {
    id: 4,
    img: "/hair/3.png",
    thumb: "/hair/3.png",
    label: "헤어 4",
    size: { w: 300, h: 300 },
    anchor: { x: 150, y: 280 },
    baseEyePx: 220,
    offsetPx: { x: -850, y: 40 },
  },
  {
    id: 5,
    img: "/hair/4.png",
    thumb: "/hair/4.png",
    label: "헤어 5",
    size: { w: 300, h: 300 },
    anchor: { x: 150, y: 280 },
    baseEyePx: 220,
    offsetPx: { x: -850, y: 40 },
  },
];

function norm360(v: number) {
  return ((Math.round(v) % 360) + 360) % 360;
}

function makeAngleHash(poseNorm: PoseNorm) {
  const x = norm360(poseNorm.x);
  const y = norm360(poseNorm.y);
  const z = norm360(poseNorm.z);

  return x * 360 ** 2 + y * 360 + z;
}

function buildFramePayload(
  userId: string,
  frameId: number,
  poseNorm: PoseNorm | null,
  landmarks: PoseNorm[] | null
) {
  if (!poseNorm || !landmarks || landmarks.length === 0 || !landmarks[10]) {
    return null;
  }

  const angleHash = makeAngleHash(poseNorm);

  return {
    user_id: userId,
    frame_id: frameId,
    camera: {
      w: 1280,
      h: 720,
    },
    angle_hash: angleHash,
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

type FramePayload = NonNullable<ReturnType<typeof buildFramePayload>>;

async function createDebugFrameCapture(
  videoEl: HTMLVideoElement | null,
  payload: FramePayload | null
) {
  if (!videoEl || !payload) return null;

  const width = videoEl.videoWidth || payload.camera.w;
  const height = videoEl.videoHeight || payload.camera.h;
  if (!width || !height) {
    throw new Error("카메라 프레임 크기를 확인할 수 없습니다.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context 생성 실패");
  }

  // 화면처럼 좌우반전된 상태로 저장하고 싶으면 이 코드 유지
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, width, height);

  const imageBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("프레임 캡쳐 실패"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.92
    );
  });

  const frameId = payload.frame_id;
  const baseName = `frame_${String(frameId).padStart(6, "0")}`;
  const imageFileName = `${baseName}.jpg`;
  const payloadFileName = `${baseName}.json`;

  const download = () => {
    const imageUrl = URL.createObjectURL(imageBlob);
    const imageAnchor = document.createElement("a");
    imageAnchor.href = imageUrl;
    imageAnchor.download = imageFileName;
    imageAnchor.click();
    URL.revokeObjectURL(imageUrl);

    const payloadBlob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const payloadUrl = URL.createObjectURL(payloadBlob);
    const payloadAnchor = document.createElement("a");
    payloadAnchor.href = payloadUrl;
    payloadAnchor.download = payloadFileName;
    payloadAnchor.click();
    URL.revokeObjectURL(payloadUrl);
  };

  return {
    frameId,
    width,
    height,
    imageBlob,
    imageFileName,
    payloadFileName,
    download,
  };
}

export default function FaceLandmarksViewPoc({
  videoRef,
  canvasRef,
  poseNorm,
  landmarks,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  poseNorm: PoseNorm | null;
  landmarks: PoseNorm[] | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameIdRef = useRef(0);
  const userId = "user-123";

  const [appliedHairId, setAppliedHairId] = useState(0);
  const [pendingHairId, setPendingHairId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [isDebugCapturing, setIsDebugCapturing] = useState(false);

  const displayHairId = pendingHairId ?? appliedHairId;

  const pendingHair = useMemo(() => {
    if (pendingHairId == null) return null;
    return HAIR_ITEMS.find((item) => item.id === pendingHairId) ?? null;
  }, [pendingHairId]);

  const handleHairSelect = useCallback(
    (nextId: number) => {
      if (modalOpen) return;
      if (nextId === appliedHairId) return;

      setPendingHairId(nextId);
      setModalOpen(true);
    },
    [appliedHairId, modalOpen]
  );

  const handleModalComplete = useCallback(() => {
    if (pendingHairId != null) {
      setAppliedHairId(pendingHairId);
    }
    setPendingHairId(null);
    setModalOpen(false);
  }, [pendingHairId]);

  const handleDebugStart = useCallback(() => {
    setIsDebugCapturing(true);
  }, []);

  const handleDebugStop = useCallback(() => {
    setIsDebugCapturing(false);
  }, []);

  useEffect(() => {
    const nextFrameId = frameIdRef.current + 1;
    frameIdRef.current = nextFrameId;

    const payload = buildFramePayload(userId, nextFrameId, poseNorm, landmarks);
    if (!payload) return;
    console.log("실제 카메라 원본 크기:", {
    videoWidth: videoRef.current?.videoWidth,
    videoHeight: videoRef.current?.videoHeight,
  });


    const send = async () => {
      try {
        // console.log("payload:", JSON.stringify(payload, null, 2));

        if (isDebugCapturing) {
          const capture = await createDebugFrameCapture(videoRef.current, payload);
          capture?.download();
        }
      } catch (err) {
        console.error("frame 전송 실패:", err);
      }
    };

    send();
  }, [poseNorm, landmarks, videoRef, isDebugCapturing]);

  return (
    <div className="grid h-screen w-screen place-items-center overflow-hidden bg-neutral-900">
      <div
        ref={wrapRef}
        className="relative h-screen w-[430px] overflow-hidden bg-black"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="block h-full w-full object-cover -scale-x-100"
        />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
        />

        <div className="absolute left-3 top-3 z-30 flex gap-2">
          <button
            type="button"
            onClick={handleDebugStart}
            disabled={isDebugCapturing}
            className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            캡쳐 시작
          </button>

          <button
            type="button"
            onClick={handleDebugStop}
            disabled={!isDebugCapturing}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            캡쳐 종료
          </button>
        </div>

        <HairSelector
          items={HAIR_ITEMS}
          selectedId={displayHairId}
          onSelect={handleHairSelect}
        />
      </div>

      <Modal
        open={modalOpen}
        targetLabel={pendingHair?.label}
        onComplete={handleModalComplete}
      />
    </div>
  );
}