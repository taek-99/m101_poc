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

function buildFramePayload(
  userId: string,
  poseNorm: PoseNorm | null,
  landmarks: PoseNorm[] | null
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
  const userId = "user-123";

  const [appliedHairId, setAppliedHairId] = useState(0);
  const [pendingHairId, setPendingHairId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

  useEffect(() => {
    const payload = buildFramePayload(userId, poseNorm, landmarks);
    if (!payload) return;

    const send = async () => {
      try {
        // console.log(JSON.stringify(payload));
      } catch (err) {
        console.error("frame 전송 실패:", err);
      }
    };

    send();
  }, [poseNorm, landmarks]);

  return (
    <div className="grid h-screen w-screen place-items-center overflow-hidden bg-black">
      <div
        ref={wrapRef}
        className="relative h-screen w-[min(88vh,95vw)] overflow-hidden bg-black"
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