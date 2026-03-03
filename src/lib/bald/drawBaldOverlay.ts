import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

type RGB = [number, number, number];

let offscreen: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;

// ===== 튜닝 파라미터 =====
const OFFSCREEN_SIZE = 96;            // 피부톤 샘플링 품질
const WIDTH_MULT = 1.18;              // 관자 폭 대비 두피 폭
const HEIGHT_MULT = 0.1;             // 얼굴높이 대비 두피 높이
const HAIRLINE_OFFSET_MULT = 0.18;    // 이마 기준선 아래로 얼마나 내려서 자를지(작을수록 이마에 딱 붙음)
const TOP_HIGHLIGHT_Y = 0.22;         // 그라데이션 하이라이트 위치(0~1)
const MAIN_ALPHA = 0.92;
const FEATHER_BLUR = 10;
const FEATHER_ALPHA = 0.22;
const SCALP_LIGHT = "rgb(210, 190, 175)";
const SCALP_DARK = "rgb(180, 160, 145)";
const HAIRLINE_OFFSET_PX = 35; // 원하는 만큼 내리기
// =======================

function getOffscreenCtx() {
  if (!offscreen) {
    offscreen = document.createElement("canvas");
    offscreen.width = OFFSCREEN_SIZE;
    offscreen.height = OFFSCREEN_SIZE;
    offCtx = offscreen.getContext("2d", { willReadFrequently: true });
  }
  return offCtx;
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, n));
}

function add([r, g, b]: RGB, amount: number): RGB {
  return [clamp(r + amount), clamp(g + amount), clamp(b + amount)];
}

function rgbToString([r, g, b]: RGB) {
  return `rgb(${r}, ${g}, ${b})`;
}

function sampleRGB(oc: CanvasRenderingContext2D, nx: number, ny: number): RGB {
  const x = Math.round(nx * (oc.canvas.width - 1));
  const y = Math.round(ny * (oc.canvas.height - 1));
  const d = oc.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function avgRGB(arr: RGB[]): RGB {
  const n = arr.length || 1;
  const s = arr.reduce(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]] as RGB,
    [0, 0, 0]
  );
  return [Math.round(s[0] / n), Math.round(s[1] / n), Math.round(s[2] / n)];
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
  w: number,
  h: number
) {
  const dx = (a.x - b.x) * w;
  const dy = (a.y - b.y) * h;
  return Math.hypot(dx, dy);
}

/**
 * ✅ 반타원(반원 느낌) 두피 오버레이
 * - hairlineY(이마 라인) 아래는 절대 덮지 않음
 * - 반타원 경로를 직접 만들어서 모양이 깔끔함
 */
export function drawBaldOverlay(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[]
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (!w || !h) return;

  const oc = getOffscreenCtx();
  if (!oc) return;
  oc.drawImage(video, 0, 0, oc.canvas.width, oc.canvas.height);

  // 기준점
  const forehead = landmarks[10];     // 이마 중앙
  const leftTemple = landmarks[234];  // 왼 관자
  const rightTemple = landmarks[454]; // 오른 관자
  const chin = landmarks[152];        // 턱

  // 화면 좌표
  const fx = forehead.x * w;
  const fy = forehead.y * h;

  const faceW = dist(leftTemple, rightTemple, w, h);
  const faceH = dist(forehead, chin, w, h);

  // 두피 크기 (과하게 커지지 않게 clamp)
  const scalpW = Math.max(120, Math.min(faceW * WIDTH_MULT, w * 0.95));
  const scalpH = Math.max(120, Math.min(faceH * HEIGHT_MULT, h * 0.70));

  // 이마 기준선(헤어라인) : 여기 아래는 안 덮게
  const hairlineY = fy + HAIRLINE_OFFSET_PX;

  // 반타원 중심: 아래 경계가 hairlineY에 오도록 세팅
  // bottomY = cy + scalpH/2 = hairlineY  => cy = hairlineY - scalpH/2
  const cx = fx;
  const cy = hairlineY - scalpH / 2;

  // 화면 밖으로 튀는 거 방지
  const safeCy = Math.max(scalpH * 0.35, Math.min(cy, h - scalpH * 0.55));

  const light = SCALP_LIGHT;
  const dark = SCALP_DARK;

  // 그라데이션(정수리 하이라이트)
  const grad = ctx.createRadialGradient(
    cx,
    safeCy - scalpH * TOP_HIGHLIGHT_Y,
    Math.max(12, scalpW * 0.06),
    cx,
    safeCy,
    scalpW * 0.75
  );
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);

  // ===== 반타원 경로(깔끔하게) =====
  // 타원 전체를 그린 뒤 clearRect로 자르지 않고,
  // “아래 절반”을 처음부터 경로에 포함시키지 않음.
  const rx = scalpW / 2;
  const ry = scalpH / 2;

  // hairlineY가 반타원의 “바닥”이 되도록:
  // 아래쪽 경계는 y=hairlineY, 위쪽은 타원 곡선
  ctx.save();

  // 1) 반타원 경로 만들기
  ctx.beginPath();
  // 타원 위쪽 반(π -> 2π)만 그림: 왼쪽 바닥에서 오른쪽 바닥으로
  ctx.ellipse(cx, safeCy, rx, ry, 0, Math.PI, Math.PI * 2);
  // 바닥 직선으로 닫기 (hairlineY에 딱 맞춤)
  ctx.lineTo(cx + rx, hairlineY);
  ctx.lineTo(cx - rx, hairlineY);
  ctx.closePath();

  // 2) 채우기
  ctx.globalAlpha = MAIN_ALPHA;
  ctx.fillStyle = grad;
  ctx.fill();

  // 3) feather(경계 부드럽게)
  ctx.filter = `blur(${FEATHER_BLUR}px)`;
  ctx.globalAlpha = FEATHER_ALPHA;
  ctx.fill();

  ctx.restore();
}