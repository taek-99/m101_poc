// hooks/hair/useOverlayTransform.ts
import { useMemo } from "react";

export type NLM = { x: number; y: number; z?: number };

function fitContainRect(vw: number, vh: number, W: number, H: number) {
  const s = Math.min(W / vw, H / vh);
  const rw = vw * s;
  const rh = vh * s;
  const ox = (W - rw) / 2;
  const oy = (H - rh) / 2;
  return { s, ox, oy };
}

export function useOverlayTransform({
  wrapRef,
  videoRef,
  landmarks,
  baseEyePx = 260,
  pngAnchor = { x: 512, y: 420 },
}: {
  wrapRef: React.RefObject<HTMLElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  landmarks: NLM[] | null;
  baseEyePx?: number;
  pngAnchor?: { x: number; y: number };
}) {
  return useMemo(() => {
    const wrap = wrapRef.current;
    const v = videoRef.current;
    if (!wrap || !v) return null;
    if (!landmarks || landmarks.length < 264) return null;

    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return null;

    const rect = wrap.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (!W || !H) return null;

    const { s, ox, oy } = fitContainRect(vw, vh, W, H);

    const L = landmarks[33];
    const R = landmarks[263];
    const N = landmarks[1];
    if (!L || !R || !N) return null;

    const Lp = { x: ox + L.x * vw * s, y: oy + L.y * vh * s };
    const Rp = { x: ox + R.x * vw * s, y: oy + R.y * vh * s };
    const Np = { x: ox + N.x * vw * s, y: oy + N.y * vh * s };

    const dx = Rp.x - Lp.x;
    const dy = Rp.y - Lp.y;
    const eyeDist = Math.hypot(dx, dy);
    if (!eyeDist) return null;

    const rot = Math.atan2(dy, dx);
    const scale = eyeDist / baseEyePx;

    const tx = Np.x - pngAnchor.x * scale;
    const ty = Np.y - pngAnchor.y * scale;

    return `translate(${tx}px, ${ty}px) rotate(${rot}rad) scale(${scale})`;
  }, [
    wrapRef,
    videoRef,
    landmarks,
    baseEyePx,
    pngAnchor.x,
    pngAnchor.y,
  ]);
}