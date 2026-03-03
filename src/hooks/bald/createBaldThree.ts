import * as THREE from "three";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { makeUpperOvalRingIdxs } from "@/lib/face/scalpRing";
import { TRIANGULATION } from "@/lib/face/triangulation";

type BaldThree = {
  resize: (w: number, h: number) => void;
  update: (lms: NormalizedLandmark[], w: number, h: number) => void;
  updateHairMask: (mask01: Uint8ClampedArray, mw: number, mh: number) => void;
  debugDrawHairMaskTo: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  dispose: () => void;
};

function lmToVec3(lm: NormalizedLandmark, w: number, h: number) {
  const x = (lm.x - 0.5) * w;
  const y = -(lm.y - 0.5) * h;
  const z = -lm.z * w;
  return new THREE.Vector3(x, y, z);
}

// ✅ 마스크 처리 유틸: dilate(확장) + box blur(페더)
function dilateBinary(src01: Uint8ClampedArray, w: number, h: number, radius: number) {
  const out = new Uint8ClampedArray(w * h);
  const r = Math.max(1, radius | 0);

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);

      let v = 0;
      for (let yy = y0; yy <= y1 && v === 0; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (src01[row + xx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function boxBlur255(src255: Uint8ClampedArray, w: number, h: number, radius: number) {
  const r = Math.max(1, radius | 0);
  const tmp = new Uint8ClampedArray(w * h);
  const out = new Uint8ClampedArray(w * h);

  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    const win = 2 * r + 1;

    for (let i = -r; i <= r; i++) {
      const x = Math.min(w - 1, Math.max(0, i));
      sum += src255[row + x];
    }
    tmp[row + 0] = (sum / win) | 0;

    for (let x = 1; x < w; x++) {
      const addX = Math.min(w - 1, x + r);
      const subX = Math.max(0, x - r - 1);
      sum += src255[row + addX] - src255[row + subX];
      tmp[row + x] = (sum / win) | 0;
    }
  }

  // vertical
  for (let x = 0; x < w; x++) {
    let sum = 0;
    const win = 2 * r + 1;

    for (let i = -r; i <= r; i++) {
      const y = Math.min(h - 1, Math.max(0, i));
      sum += tmp[y * w + x];
    }
    out[0 * w + x] = (sum / win) | 0;

    for (let y = 1; y < h; y++) {
      const addY = Math.min(h - 1, y + r);
      const subY = Math.max(0, y - r - 1);
      sum += tmp[addY * w + x] - tmp[subY * w + x];
      out[y * w + x] = (sum / win) | 0;
    }
  }

  return out;
}

function emaVec3(prev: THREE.Vector3, next: THREE.Vector3, a: number) {
  return prev.multiplyScalar(1 - a).add(next.multiplyScalar(a));
}

function computeTrueUp(lms: NormalizedLandmark[], w: number, h: number) {
  const chin = lmToVec3(lms[152], w, h);
  const forehead = lmToVec3(lms[10], w, h);
  let up = forehead.clone().sub(chin).normalize();
  if (up.y < 0) up.multiplyScalar(-1);
  return { chin, forehead, up };
}

export function createBaldThree(canvas: HTMLCanvasElement): BaldThree {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  // Hair mask texture (RGBA: hair=green with alpha, bg=transparent)
  const hairMaskCanvas = document.createElement("canvas");
  hairMaskCanvas.width = 512;
  hairMaskCanvas.height = 512;
  const hmCtx = hairMaskCanvas.getContext("2d")!;
  const hairMaskTex = new THREE.CanvasTexture(hairMaskCanvas);
  hairMaskTex.minFilter = THREE.LinearFilter;
  hairMaskTex.magFilter = THREE.LinearFilter;
  hairMaskTex.generateMipmaps = false;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  camera.position.set(0, 0, 1000);
  camera.lookAt(0, 0, 0);

  // Face occluder (depth-only)
  const faceGeom = new THREE.BufferGeometry();
  const facePositions = new Float32Array(468 * 3);
  faceGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(facePositions, 3).setUsage(THREE.DynamicDrawUsage)
  );
  faceGeom.setIndex(TRIANGULATION);

  const faceMat = new THREE.MeshDepthMaterial({ depthTest: true, depthWrite: true });
  faceMat.colorWrite = false;
  faceMat.blending = THREE.NoBlending;
  faceMat.transparent = false;

  const faceOccluder = new THREE.Mesh(faceGeom, faceMat);
  faceOccluder.renderOrder = 0;
  faceOccluder.frustumCulled = false;
  scene.add(faceOccluder);

  // Dome geometry
  const ringCount = 64;
  const layers = 28;
  const vCount = ringCount * layers;

  const domePositions = new Float32Array(vCount * 3);
  const domeUVs = new Float32Array(vCount * 2);
  const domeIdx: number[] = [];

  for (let y = 0; y < layers - 1; y++) {
    for (let i = 0; i < ringCount; i++) {
      const i0 = y * ringCount + i;
      const i1 = y * ringCount + ((i + 1) % ringCount);
      const i2 = (y + 1) * ringCount + i;
      const i3 = (y + 1) * ringCount + ((i + 1) % ringCount);
      domeIdx.push(i0, i2, i1, i1, i2, i3);
    }
  }

  for (let y = 0; y < layers; y++) {
    for (let i = 0; i < ringCount; i++) {
      const id = y * ringCount + i;
      domeUVs[id * 2 + 0] = i / ringCount;
      domeUVs[id * 2 + 1] = y / (layers - 1);
    }
  }

  const domeGeom = new THREE.BufferGeometry();
  domeGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(domePositions, 3).setUsage(THREE.DynamicDrawUsage)
  );
  domeGeom.setAttribute("uv", new THREE.BufferAttribute(domeUVs, 2));
  domeGeom.setIndex(domeIdx);

  // Scalp texture
  const texCanvas = document.createElement("canvas");
  texCanvas.width = 256;
  texCanvas.height = 256;
  const tctx = texCanvas.getContext("2d")!;
  const scalpTex = new THREE.CanvasTexture(texCanvas);

  const domeMat = new THREE.MeshStandardMaterial({
    map: scalpTex,
    transparent: true,
    opacity: 0.98,     // ✅ 두피를 좀 더 확실히
    roughness: 0.9,
    metalness: 0.0,
    depthTest: true,
    depthWrite: false,
  });

    // ✅ "머리카락 지우기": hair 있는 곳에서만 두피가 보이게
domeMat.onBeforeCompile = (shader) => {
  shader.uniforms.uHairMask = { value: hairMaskTex };

  // ✅ screen uv 전달
  shader.vertexShader = shader.vertexShader
    .replace(
      "void main() {",
      `
      varying vec2 vScreenUv;
      void main() {
      `
    )
    .replace(
      "#include <project_vertex>",
      `
      #include <project_vertex>
      vec2 ndc = gl_Position.xy / gl_Position.w;
      vScreenUv = ndc * 0.5 + 0.5;
      `
    );

  shader.fragmentShader =
    `
    uniform sampler2D uHairMask;
    varying vec2 vScreenUv;
    ` + shader.fragmentShader;

  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <dithering_fragment>",
    `
    // ✅ 너는 -scale-x-100(미러)라서 X 뒤집기 필요
    vec2 uv = vec2(1.0 - vScreenUv.x, vScreenUv.y);

    float hairA = texture2D(uHairMask, uv).a;
    float hair = clamp(hairA * 1.5, 0.0, 1.0);

    // ✅ 머리카락 지우기: hair 있는 곳에서만 두피가 보이게(=덮기)
    diffuseColor.a *= hair;

    #include <dithering_fragment>
    `
  );

  (domeMat as any).userData.shader = shader;
};
domeMat.needsUpdate = true;
  const domeMesh = new THREE.Mesh(domeGeom, domeMat);
  domeMesh.renderOrder = 1;
  domeMesh.frustumCulled = false;
  scene.add(domeMesh);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 0.25);
  dir.position.set(0, 0, 1000);
  scene.add(dir);

  let smoothUp = new THREE.Vector3(0, 1, 0);
  let smoothCenter = new THREE.Vector3(0, 0, 0);

  function drawScalpTexture(base: { r: number; g: number; b: number }) {
    tctx.clearRect(0, 0, 256, 256);

    const grad = tctx.createRadialGradient(128, 70, 10, 128, 140, 170);
    grad.addColorStop(0, `rgb(${base.r + 18},${base.g + 18},${base.b + 18})`);
    grad.addColorStop(1, `rgb(${base.r - 10},${base.g - 10},${base.b - 10})`);
    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, 256, 256);

    tctx.globalAlpha = 0.12;
    tctx.fillStyle = "white";
    tctx.beginPath();
    tctx.ellipse(140, 60, 55, 35, -0.2, 0, Math.PI * 2);
    tctx.fill();
    tctx.globalAlpha = 1;

    scalpTex.needsUpdate = true;
  }

  function sampleSkinBaseColor(_lms: NormalizedLandmark[]) {
    // ✅ 더 두피 같은 톤(약간 더 붉고 어두운)
    return { r: 200, g: 170, b: 160 };
  }

  function resize(w: number, h: number) {
    renderer.setSize(w, h, false);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();

    const shader = (domeMat as any).userData.shader;
    if (shader?.uniforms?.uResolution) {
      shader.uniforms.uResolution.value.set(w, h);
    }
  }

  function debugDrawHairMaskTo(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(hairMaskCanvas, 0, 0, w, h);
    ctx.restore();
  }

function updateHairMask(mask01: Uint8ClampedArray, mw: number, mh: number) {
  if (hairMaskCanvas.width !== mw) hairMaskCanvas.width = mw;
  if (hairMaskCanvas.height !== mh) hairMaskCanvas.height = mh;

  // (선택) 기존에 쓰던 dilate/blur 결과가 있으면 a255를 그걸로 쓰면 됨
  // 여기선 단순 버전: mask01 -> a(0/255)
  const img = hmCtx.createImageData(mw, mh);
  const d = img.data;

  for (let i = 0; i < mw * mh; i++) {
    const isHair = mask01[i] === 1;
    const a = isHair ? 255 : 0;
    const j = i * 4;

    // ✅ 색은 의미 없음(마스크는 알파만 씀) → 흰색/투명으로
    d[j + 0] = 255;
    d[j + 1] = 255;
    d[j + 2] = 255;
    d[j + 3] = a;     // ✅ 알파만 의미 있음
  }

  hmCtx.putImageData(img, 0, 0);
  hairMaskTex.needsUpdate = true;

  const shader = (domeMat as any).userData.shader;
  if (shader?.uniforms?.uHairMask) shader.uniforms.uHairMask.value = hairMaskTex;
}



  function update(lms: NormalizedLandmark[], w: number, h: number) {
    renderer.clear(true, true, true);

    // face occluder update
    {
      const posAttr = faceGeom.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < 468; i++) {
        const p = lmToVec3(lms[i], w, h);
        posAttr.setXYZ(i, p.x, p.y, p.z);
      }
      posAttr.needsUpdate = true;
    }

    // ring points
    const ringIdxs = makeUpperOvalRingIdxs(lms, 0.55);
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i < ringCount; i++) {
      const t = i / ringCount;
      const src = ringIdxs[Math.floor(t * ringIdxs.length) % ringIdxs.length];
      ringPts.push(lmToVec3(lms[src], w, h));
    }

    const ringCenter = ringPts
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .multiplyScalar(1 / ringPts.length);

    const { up, forehead, chin } = computeTrueUp(lms, w, h);
    smoothUp = emaVec3(smoothUp, up.clone(), 0.25).normalize();

    const faceH = forehead.distanceTo(chin);

    const targetCenter = ringCenter.clone().add(smoothUp.clone().multiplyScalar(faceH * 0.10));
    if (smoothCenter.lengthSq() === 0) smoothCenter.copy(targetCenter);
    smoothCenter = emaVec3(smoothCenter, targetCenter.clone(), 0.25);

    const center = smoothCenter;
    const domeHeight = faceH * 0.45;

    const HAIRLINE_LIFT = faceH * 0.02;
    for (let i = 0; i < ringPts.length; i++) {
      ringPts[i].add(smoothUp.clone().multiplyScalar(HAIRLINE_LIFT));
    }

    // dome vertices
    const domePos = domeGeom.getAttribute("position") as THREE.BufferAttribute;
    for (let y = 0; y < layers; y++) {
      const t = y / (layers - 1);
      const theta = t * (Math.PI / 2);
      const radial = Math.cos(theta);
      const height = Math.sin(theta);

      for (let i = 0; i < ringCount; i++) {
        const base = ringPts[i].clone();
        const dir = base.clone().sub(center);

        const p = center
          .clone()
          .add(dir.multiplyScalar(radial))
          .add(smoothUp.clone().multiplyScalar(height * domeHeight));

        const vid = y * ringCount + i;
        domePos.setXYZ(vid, p.x, p.y, p.z);
      }
    }

    domePos.needsUpdate = true;
    domeGeom.computeVertexNormals();

    drawScalpTexture(sampleSkinBaseColor(lms));
    renderer.render(scene, camera);
  }

  function dispose() {
    faceGeom.dispose();
    faceMat.dispose();
    domeGeom.dispose();
    domeMat.dispose();
    scalpTex.dispose();
    hairMaskTex.dispose();
    renderer.dispose();
  }

  return { resize, update, updateHairMask, debugDrawHairMaskTo, dispose };
}