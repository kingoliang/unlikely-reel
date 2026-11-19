// The Unlikely Reel — a small 3D screening room. Everything except the film clips is generated in code.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------- the works on the walls
const WORKS = [
  { id: 'MvZdlRJcGZY', series: 'Cat POV', title: "POV: your cat won't let you close a door", note: 'Mochi #2. One closed door, one cat who disagrees.', wall: 'L', at: 2.3 },
  { id: '8r2T2ESJ1e8', series: 'Cat POV', title: "POV: you sat in your cat's spot", note: 'You sat down. That was a mistake.', wall: 'L', at: -0.4 },
  { id: 'gA2ibMj-KYM', series: 'AI Animal World', title: 'The Pistol Shrimp Fires a Bubble, Not Its Claws', note: 'AI Animal World #14. Small shrimp, big gun.', wall: 'B', at: -2.6 },
  { id: 'oVdgNLRGXik', series: 'AI Animal World', title: 'Hermit Crabs: The Housing Queue', note: 'AI Animal World #37. One empty shell. Everyone is interested.', wall: 'B', at: 0 },
  { id: 'hGF10wT2Rvo', series: 'AI Animal World', title: 'How a Gecko Lets Go: It Peels Like Tape', note: 'AI Animal World #21. Sticking without glue.', wall: 'B', at: 2.6 },
  { id: '0FRCpiVlSE0', series: 'Impossible Evidence', title: 'Only One Note Had the Smear', note: 'Fiction. Two notes, one name. Only one had the smear.', wall: 'R', at: -2.3, mood: 'red' },
];

// Room in metres; the back wall (z0) faces the entrance.
const ROOM = { x0: -4.5, x1: 4.5, z0: -5.5, z1: 5.5, h: 3.4 };
const BENCH = { x0: -1.25, x1: 1.25, z0: 0.55, z1: 1.05, h: 0.46 };
const SCREEN = { w: 0.9, h: 1.6, y: 1.72 };
const EYE = 1.62;

const Q = new URLSearchParams(location.search);
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const $ = (s) => document.querySelector(s);

// ---------------------------------------------------------------- WebGL or fallback
const canvas = $('#c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('shot') });
} catch (e) {
  document.body.classList.add('nogl'); $('#intro').classList.add('hide'); $('#works').classList.remove('hide');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040405);
scene.fog = new THREE.Fog(0x050507, 9, 22);
const camera = new THREE.PerspectiveCamera(MOBILE ? 68 : 60, innerWidth / innerHeight, 0.05, 60);

{ // faint environment for glossy highlights only
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
}

// ---------------------------------------------------------------- procedural textures
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function plaster(seed) {
  return canvasTex(512, 512, (c, w, h) => {
    const r = rng(seed), img = c.createImageData(w, h), d = img.data;
    // smooth value noise, 3 octaves, tiling
    const oct = [[8, 0.55], [32, 0.3], [128, 0.15]], grids = oct.map(([n]) => Array.from({ length: n * n }, r));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0;
      oct.forEach(([n, a], k) => {
        const g = grids[k], fx = (x / w) * n, fy = (y / h) * n, ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
        v += a * ((at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty);
      });
      const q = 150 + (v - 0.5) * 90 + (r() - 0.5) * 18, i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = q; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, { srgb: false, repeat: [3, 1.2] });
}
const floorTex = canvasTex(1024, 1024, (c, w, h) => {
  const r = rng(7), rows = 8, ph = h / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r() * w * 0.5;
    while (x < w) {
      const len = w * (0.35 + r() * 0.4), tone = 48 + r() * 26, warm = 0.62 + r() * 0.06;
      const g = c.createLinearGradient(0, j * ph, 0, (j + 1) * ph);
      g.addColorStop(0, `rgb(${tone},${tone * warm},${tone * warm * 0.72})`);
      g.addColorStop(1, `rgb(${tone * 0.86},${tone * warm * 0.86},${tone * warm * 0.62})`);
      c.fillStyle = g; c.fillRect(x, j * ph, len, ph);
      for (let k = 0; k < 26; k++) { // grain lines
        c.strokeStyle = `rgba(20,12,6,${0.08 + r() * 0.14})`; c.lineWidth = 0.6 + r() * 1.4;
        const yy = j * ph + r() * ph; c.beginPath(); c.moveTo(x, yy);
        c.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 8, x + len * 0.7, yy + (r() - 0.5) * 8, x + len, yy + (r() - 0.5) * 6); c.stroke();
      }
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(x, j * ph, 2, ph);
      x += len;
    }
    c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(0, j * ph, w, 2);
  }
}, { repeat: [2.2, 2.7] });
const floorRough = canvasTex(256, 256, (c, w, h) => {
  const r = rng(11); c.fillStyle = '#6a6a6a'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.05)`; const s = 4 + r() * 30; c.fillRect(r() * w, r() * h, s, s * 0.3); }
}, { srgb: false, repeat: [3, 3] });

// ---------------------------------------------------------------- room shell
const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0, H = ROOM.h;
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughnessMap: floorRough, roughness: 0.55, metalness: 0, transparent: true, opacity: 0.86, envMapIntensity: 0.6 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.set((ROOM.x0 + ROOM.x1) / 2, 0, (ROOM.z0 + ROOM.z1) / 2);
floor.name = 'floor'; floor.renderOrder = 1; scene.add(floor);

const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 1 }));
ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, 0); scene.add(ceil);

const WALLS = {
  // name: [center, rotationY, width, colour]
  B: [new THREE.Vector3(0, H / 2, ROOM.z0), 0, W, 0x2c4448],
  F: [new THREE.Vector3(0, H / 2, ROOM.z1), Math.PI, W, 0x26292e],
  L: [new THREE.Vector3(ROOM.x0, H / 2, 0), Math.PI / 2, D, 0x4a3828],
  R: [new THREE.Vector3(ROOM.x1, H / 2, 0), -Math.PI / 2, D, 0x3c2a2e],
};
const wallNormal = (k) => new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), WALLS[k][1]);
const baseMat = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.45 });
for (const [k, [c, ry, w, col]] of Object.entries(WALLS)) {
  const tex = plaster(k.charCodeAt(0));
  tex.repeat.set(w / 3, H / 3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({ color: col, map: tex, bumpMap: tex, bumpScale: 0.6, roughness: 0.92 }));
  m.position.copy(c); m.rotation.y = ry; m.name = 'wall'; scene.add(m);
  const n = wallNormal(k);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.025), baseMat);
  skirt.position.copy(c).setY(0.06).addScaledVector(n, 0.012); skirt.rotation.y = ry; scene.add(skirt);
}
// entrance: a dark doorway with a soft frame on the front wall
{
  const door = new THREE.Group(); door.position.set(2.6, 0, ROOM.z1 - 0.01); door.rotation.y = Math.PI; scene.add(door);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), new THREE.MeshBasicMaterial({ color: 0x010101 }));
  hole.position.set(0, 1.15, 0.005); door.add(hole);
  const fm = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.5 });
  for (const [x, y, w, h] of [[-0.66, 1.18, 0.1, 2.36], [0.66, 1.18, 0.1, 2.36], [0, 2.36, 1.42, 0.1]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), fm); b.position.set(x, y, 0.03); door.add(b);
  }
}
// track rails on the ceiling
{
  const m = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.35, metalness: 0.6 });
  for (const k of ['B', 'L', 'R']) {
    const [c, ry, w] = WALLS[k], n = wallNormal(k);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.035, 0.05), m);
    rail.position.copy(c).setY(H - 0.03).addScaledVector(n, 1.05); rail.rotation.y = ry; scene.add(rail);
  }
}
// bench in the middle of the room
{
  const g = new THREE.Group(); g.position.set((BENCH.x0 + BENCH.x1) / 2, 0, (BENCH.z0 + BENCH.z1) / 2); scene.add(g);
  const woodTex = canvasTex(512, 64, (c, w, h) => {
    const r = rng(3); c.fillStyle = '#3a2618'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(${r() > 0.5 ? '15,8,3' : '90,60,36'},${0.15 + r() * 0.2})`; c.lineWidth = 0.5 + r(); const y = r() * h; c.beginPath(); c.moveTo(0, y); c.quadraticCurveTo(w / 2, y + (r() - 0.5) * 10, w, y + (r() - 0.5) * 6); c.stroke(); }
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(BENCH.x1 - BENCH.x0, 0.07, BENCH.z1 - BENCH.z0), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.38 }));
  top.position.y = BENCH.h - 0.035; g.add(top);
  const legM = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.3, metalness: 0.8 });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, BENCH.h - 0.07, (BENCH.z1 - BENCH.z0) - 0.08), legM);
    leg.position.set(sx * ((BENCH.x1 - BENCH.x0) / 2 - 0.18), (BENCH.h - 0.07) / 2, 0); g.add(leg);
  }
  g.name = 'bench';
}

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0x8a96b8, 0x2a1d12, 1.25));
// soft wall washers so the room reads, without competing with the picture lights
for (const [x, z] of [[-2.6, -3.6], [2.6, -3.6], [-2.6, 2.4], [2.6, 2.4], [0, 4.6]]) { const l = new THREE.PointLight(0xa8b0cc, 6, 9, 2); l.position.set(x, ROOM.h - 0.25, z); scene.add(l); }
const lightConeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uColor: { value: new THREE.Color(1, 0.86, 0.66) }, uStrength: { value: MOBILE ? 0.022 : 0.03 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vT;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vT = uv.y; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV; varying float vT;
    void main(){ float f = pow(abs(dot(vN, vV)), 2.5); float a = uStrength * f * smoothstep(0.0, 0.25, 1.0 - vT) * smoothstep(0.0, 0.6, vT); gl_FragColor = vec4(uColor * a, 1.0); }`,
});

// ---------------------------------------------------------------- frames
const loader = new THREE.TextureLoader();
const fadeTex = canvasTex(4, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#000'); g.addColorStop(0.55, '#111'); g.addColorStop(1, '#fff'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, { srgb: false });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.42, metalness: 0.1 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.32, metalness: 1 });
const pickables = [];
const SERIES_COL = { 'Cat POV': '#ffcf3f', 'AI Animal World': '#7fe0c8', 'Impossible Evidence': '#ff6a5a' };

function plaque(w) {
  return canvasTex(512, 200, (c, cw, ch) => {
    c.fillStyle = '#d9d2c4'; c.fillRect(0, 0, cw, ch);
    c.fillStyle = SERIES_COL[w.series] === '#ffcf3f' ? '#8a6a10' : SERIES_COL[w.series] === '#7fe0c8' ? '#1d6b5c' : '#8a2a22';
    c.font = '600 24px ui-sans-serif, system-ui, sans-serif'; c.fillText(w.series.toUpperCase(), 26, 46);
    c.fillStyle = '#0d0c0a'; c.font = '600 32px Georgia, serif';
    const words = w.title.split(' '); let line = '', y = 94;
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > cw - 52) { c.fillText(line, 26, y); line = wd; y += 38; } else line = t; }
    c.fillText(line, 26, y);
    c.fillStyle = '#6d675d'; c.font = '400 20px ui-sans-serif, system-ui, sans-serif'; c.fillText('click to watch  ▶', 26, ch - 22);
  });
}

const frames = WORKS.map((w, i) => {
  const [c, ry] = WALLS[w.wall], n = wallNormal(w.wall);
  const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  const g = new THREE.Group(); g.rotation.y = ry;
  g.position.copy(c).setY(0).addScaledVector(along, w.at).addScaledVector(n, 0.005);
  scene.add(g);

  const fr = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.w + 0.16, SCREEN.h + 0.16, 0.07), frameMat);
  fr.position.set(0, SCREEN.y, 0.035); g.add(fr);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.w + 0.03, SCREEN.h + 0.03, 0.074), new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.8 }));
  lip.position.set(0, SCREEN.y, 0.035); g.add(lip);

  const poster = loader.load(`media/${w.id}.jpg`); poster.colorSpace = THREE.SRGBColorSpace;
  const scrMat = new THREE.MeshBasicMaterial({ map: poster, toneMapped: false, color: new THREE.Color(0.92, 0.92, 0.92) });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), scrMat);
  scr.position.set(0, SCREEN.y, 0.074); g.add(scr);

  // fake floor reflection: mirrored copy below the semi-transparent floor
  const mirMat = new THREE.MeshBasicMaterial({ map: poster, alphaMap: fadeTex, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
  const mir = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), mirMat);
  mir.position.set(0, -SCREEN.y, 0.074); mir.scale.y = -1; mir.renderOrder = 0; g.add(mir);

  // label plaque to the right of the frame
  const ptex = plaque(w), pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.195), new THREE.MeshStandardMaterial({ map: ptex, roughness: 1, metalness: 0, envMapIntensity: 0, emissive: 0xffffff, emissiveIntensity: 0.05, emissiveMap: ptex }));
  pl.position.set(SCREEN.w / 2 + 0.4, 1.2, 0.012); g.add(pl);
  const plBack = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.205, 0.008), frameMat); plBack.position.set(SCREEN.w / 2 + 0.4, 1.2, 0.004); g.add(plBack);

  // picture light: brass bar + arm
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.56, 16), brass); bar.rotation.z = Math.PI / 2;
  bar.position.set(0, SCREEN.y + SCREEN.h / 2 + 0.2, 0.26); g.add(bar);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8), brass); arm.rotation.x = Math.PI / 2 - 0.5;
  arm.position.set(0, SCREEN.y + SCREEN.h / 2 + 0.13, 0.13); g.add(arm);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.018), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.5, 1.8), toneMapped: false }));
  glow.position.set(0, SCREEN.y + SCREEN.h / 2 + 0.172, 0.27); glow.rotation.x = Math.PI / 2; g.add(glow);

  const red = w.mood === 'red';
  const sp = new THREE.SpotLight(red ? 0xff7a66 : 0xffd9a8, red ? 20 : 24, 6, red ? 0.52 : 0.58, 0.7, 2);
  sp.position.set(0, SCREEN.y + SCREEN.h / 2 + 0.16, 0.3); g.add(sp);
  const tgt = new THREE.Object3D(); tgt.position.set(0, SCREEN.y - 0.35, 0); g.add(tgt); sp.target = tgt;

  // soft volumetric cone from the lamp to the wall
  const len = 1.55, cone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.62, len, 32, 1, true), lightConeMat);
  const from = new THREE.Vector3(0, SCREEN.y + SCREEN.h / 2 + 0.16, 0.3), to = new THREE.Vector3(0, SCREEN.y - 0.45, 0.06);
  cone.position.copy(from).lerp(to, 0.5);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  g.add(cone);

  scr.userData.work = i; fr.userData.work = i; pl.userData.work = i;
  pickables.push(scr, fr, pl);
  g.updateMatrixWorld(true);
  const center = scr.getWorldPosition(new THREE.Vector3());
  return { w, g, scr, scrMat, mirMat, poster, video: null, vtex: null, center, normal: n.clone() };
});

// ---------------------------------------------------------------- neon sign on the right wall
{
  const tex = canvasTex(1024, 300, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const tubes = (txt, y, size, col, weight) => {
      c.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
      c.shadowColor = col; c.shadowBlur = 26; c.strokeStyle = col; c.lineWidth = 7; c.strokeText(txt, w / 2, y);
      c.shadowBlur = 8; c.strokeStyle = '#fff7d8'; c.lineWidth = 2.4; c.strokeText(txt, w / 2, y);
    };
    tubes('THE UNLIKELY', 92, 92, '#ffcf3f', 300);
    tubes('REEL', 205, 120, '#ff4d3d', 400);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.675), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15), depthWrite: false, blending: THREE.AdditiveBlending }));
  sign.position.set(0, 3.02, ROOM.z0 + 0.03); sign.scale.setScalar(0.74); scene.add(sign);
    // (no floor reflection for the sign: it read as a glitch)
  const pl = new THREE.PointLight(0xffb060, 2.4, 4.0, 2); pl.position.set(0, 2.95, ROOM.z0 + 0.5); scene.add(pl);
  // right wall: the tagline as three neon lines in the series colours
  const tag = canvasTex(1024, 640, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.textAlign = 'left'; c.textBaseline = 'middle';
    const line = (txt, y, col) => {
      let px = 112; c.font = `800 ${px}px "Helvetica Neue", Arial, sans-serif`;
      while (c.measureText(txt).width > w - 100 && px > 40) { px -= 4; c.font = `800 ${px}px "Helvetica Neue", Arial, sans-serif`; }
      c.shadowColor = col; c.shadowBlur = 16; c.strokeStyle = col; c.lineWidth = 7; c.strokeText(txt, 40, y);
      c.shadowBlur = 0; c.strokeStyle = '#fff3dc'; c.lineWidth = 1.6; c.strokeText(txt, 40, y);
    };
    line('TINY FILMS.', 120, '#ffcf3f');
    line('STRANGE WORLDS.', 320, '#7fe0c8');
    line('BIG IMAGINATION.', 520, '#ff6a5a');
  });
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.875), new THREE.MeshBasicMaterial({ map: tag, transparent: true, toneMapped: false, color: new THREE.Color(0.75, 0.75, 0.75), depthWrite: false, blending: THREE.AdditiveBlending }));
  s2.position.set(ROOM.x1 - 0.03, 1.85, 2.25); s2.rotation.y = -Math.PI / 2; scene.add(s2);
  // colour spill on the wall around the letters
  [[0xffcf3f, 2.45], [0x7fe0c8, 1.85], [0xff6a5a, 1.25]].forEach(([col, y]) => {
    const l = new THREE.PointLight(col, 0.9, 2.6, 2); l.position.set(ROOM.x1 - 0.45, y, 2.25); scene.add(l);
  });
}

// ---------------------------------------------------------------- dust in the light
const dust = (() => {
  const N = MOBILE ? 14 : 24, pos = [], seed = [];
  const r = rng(99);
  for (const f of frames) for (let i = 0; i < N; i++) {
    const p = new THREE.Vector3((r() - 0.5) * 1.1, SCREEN.y + (r() - 0.35) * 1.6, 0.15 + r() * 0.7).applyMatrix4(f.g.matrixWorld);
    pos.push(p.x, p.y, p.z); seed.push(r() * 100);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float seed; uniform float uTime; uniform float uPx; varying float vA;
      void main(){ vec3 p = position; float t = uTime*0.12 + seed;
        p += vec3(sin(t*1.3)*0.06, sin(t*0.7+seed)*0.09, cos(t*1.1)*0.05);
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = uPx * (1.2 + fract(seed*7.13)*1.3) * (3.0 / -mv.z);
        vA = 0.35 + 0.65*fract(seed*3.7); vA *= 0.5 + 0.5*sin(uTime*0.8 + seed*5.0); }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(d)); gl_FragColor = vec4(vec3(1.0,0.9,0.75)*a*vA*0.25, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return mat;
})();

// ---------------------------------------------------------------- post: bloom, grade, grain, vignette
const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.6, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(c, c*vec3(1.03,1.0,0.94), 0.6);                         // warm print
      vec2 q = vUv - 0.5; float v = smoothstep(0.95, 0.25, length(q*vec2(1.1,1.0))); c *= mix(0.7, 1.0, v);
      c += (h(vUv*vec2(1920.0,1080.0) + fract(uTime)*91.0) - 0.5) * 0.045;
      gl_FragColor = vec4(c * uFade, 1.0); }`,
});
composer.addPass(grain);

// ---------------------------------------------------------------- player
const P = { pos: new THREE.Vector3(0.6, 0, 4.6), yaw: 0.05, pitch: -0.02, mode: 'intro', tween: null };
const clampPos = (p) => {
  p.x = THREE.MathUtils.clamp(p.x, ROOM.x0 + 0.5, ROOM.x1 - 0.5);
  p.z = THREE.MathUtils.clamp(p.z, ROOM.z0 + 0.7, ROOM.z1 - 0.45);
  const m = 0.32;
  if (p.x > BENCH.x0 - m && p.x < BENCH.x1 + m && p.z > BENCH.z0 - m && p.z < BENCH.z1 + m) {
    const dx = Math.min(p.x - (BENCH.x0 - m), (BENCH.x1 + m) - p.x), dz = Math.min(p.z - (BENCH.z0 - m), (BENCH.z1 + m) - p.z);
    if (dx < dz) p.x = p.x - (BENCH.x0 - m) < (BENCH.x1 + m) - p.x ? BENCH.x0 - m : BENCH.x1 + m;
    else p.z = p.z - (BENCH.z0 - m) < (BENCH.z1 + m) - p.z ? BENCH.z0 - m : BENCH.z1 + m;
  }
  return p;
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function lookAngles(from, to) {
  const d = to.clone().sub(from);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}
function tweenTo(pos, yaw, pitch, dur, done) {
  P.tween = { t: 0, dur, p0: P.pos.clone(), p1: pos.clone(), y0: P.yaw, dy: angDiff(P.yaw, yaw), pi0: P.pitch, pi1: pitch, done };
}
function walkTo(pt) {
  const dest = clampPos(new THREE.Vector3(pt.x, 0, pt.z));
  const d = dest.distanceTo(P.pos);
  if (d < 0.05) return;
  tweenTo(dest, P.yaw, P.pitch, THREE.MathUtils.clamp(d / 2.2, 0.35, 2.2));
}
function focusWork(i) {
  const f = frames[i];
  const stand = f.center.clone().addScaledVector(f.normal, MOBILE ? 2.3 : 1.9).setY(0);
  clampPos(stand);
  const a = lookAngles(stand.clone().setY(EYE), f.center);
  tweenTo(stand, a.yaw, a.pitch, 1.0, () => openModal(i));
}

// ---------------------------------------------------------------- wall clips
function ensureVideo(f) {
  if (f.video) return f.video;
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto';
  v.src = `media/${f.w.id}.mp4`;
  f.video = v; f.vtex = new THREE.VideoTexture(v); f.vtex.colorSpace = THREE.SRGBColorSpace;
  v.addEventListener('playing', () => { if (f.scrMat.map !== f.vtex) { f.scrMat.map = f.mirMat.map = f.vtex; f.scrMat.needsUpdate = f.mirMat.needsUpdate = true; } });
  return v;
}
let clipsPaused = false, mobileActive = -1;
// phone: only the film you're facing plays (battery / heat). desktop: all six loop.
function pickFacing() {
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  let best = -1, bestS = Infinity;
  frames.forEach((f, i) => {
    const to = f.center.clone().sub(camera.position), d = to.length(); to.normalize();
    const facing = fwd.dot(to), front = -to.dot(f.normal);
    if (facing < 0.6 || front < 0.15 || d > 7.5) return;
    const sc = d * (1.6 - facing) - (i === mobileActive ? 0.6 : 0);
    if (sc < bestS) { bestS = sc; best = i; }
  });
  return best;
}
function updateVideos() {
  if (MOBILE) mobileActive = clipsPaused ? -1 : pickFacing();
  frames.forEach((f, i) => {
    const v = ensureVideo(f);
    const on = !clipsPaused && (!MOBILE || i === mobileActive);
    if (on && v.paused) v.play().catch(() => {});
    else if (!on && !v.paused) v.pause();
    if (MOBILE && !on && f.scrMat.map !== f.poster) { f.scrMat.map = f.mirMat.map = f.poster; f.scrMat.needsUpdate = f.mirMat.needsUpdate = true; }
  });
}
const playAll = () => { clipsPaused = false; if (MOBILE) updateVideos(); else frames.forEach((f) => ensureVideo(f).play().catch(() => {})); };
const pauseAll = () => { clipsPaused = true; frames.forEach((f) => f.video && f.video.pause()); };
// stagger start points so the six loops don't flick in sync
frames.forEach((f, i) => { const v = ensureVideo(f); v.addEventListener('loadedmetadata', () => { v.currentTime = (i * 1.37) % Math.max(1, v.duration - 0.5); }, { once: true }); });

// ---------------------------------------------------------------- modal player
const modal = $('#modal'), vidBox = $('#vidBox');
function openModal(i) {
  const w = WORKS[i];
  $('#mSeries').textContent = w.series; $('#mTitle').textContent = w.title; $('#mNote').textContent = w.note;
  $('#mYt').href = `https://www.youtube.com/shorts/${w.id}`;
  vidBox.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${w.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="${w.title.replace(/"/g, '&quot;')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  modal.classList.remove('hide'); P.mode = 'modal';
  pauseAll();
}
function closeModal() {
  vidBox.innerHTML = ''; modal.classList.add('hide'); P.mode = 'walk';
  playAll();
}
$('#closeBtn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// ---------------------------------------------------------------- input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hit(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects([...pickables, floor, ...scene.children.filter((o) => o.name === 'wall' || o.name === 'bench')], true)[0];
  return h || null;
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (P.mode !== 'walk') return;
  drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 6) {
      const k = MOBILE ? 0.0055 : 0.0034;
      P.yaw += dx * k; P.pitch = THREE.MathUtils.clamp(P.pitch + dy * k, -0.9, 0.7);
      P.tween = P.tween && !P.tween.done ? null : P.tween;
    }
    return;
  }
  if (P.mode === 'walk' && e.pointerType === 'mouse') hover(e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const wasDrag = drag.moved > 6; drag = null;
  if (wasDrag || P.mode !== 'walk') return;
  const h = hit(e.clientX, e.clientY);
  if (!h) return;
  if (h.object.userData.work !== undefined) focusWork(h.object.userData.work);
  else if (h.object === floor) walkTo(h.point);
});
const tip = $('#tip'); let hoverT = 0;
function hover(x, y) {
  const now = performance.now(); if (now - hoverT < 50) return; hoverT = now;
  const h = hit(x, y);
  if (h && h.object.userData.work !== undefined) {
    const w = WORKS[h.object.userData.work];
    tip.textContent = '▶ ' + w.title; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.remove('hide'); canvas.style.cursor = 'pointer';
  } else { tip.classList.add('hide'); canvas.style.cursor = h && h.object === floor ? 'crosshair' : 'grab'; }
}
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && P.mode === 'modal') closeModal();
  if (P.mode !== 'walk') return;
  keys.add(e.code); if (keys.size) P.tween = null;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// works list in the HUD
const works = $('#works');
$('#worksBtn').addEventListener('click', () => works.classList.toggle('hide'));
works.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-id]'); if (!a || document.body.classList.contains('nogl')) return;
  e.preventDefault(); works.classList.add('hide');
  const i = WORKS.findIndex((w) => w.id === a.dataset.id); if (i >= 0) focusWork(i);
});

// ---------------------------------------------------------------- intro / enter
const enter = $('#enter'), intro = $('#intro');
if (MOBILE) { $('#how').textContent = 'drag to look · tap the floor to walk · tap a film to watch'; $('#hint').textContent = 'drag to look · tap floor · tap a film'; }
THREE.DefaultLoadingManager.onLoad = () => { enter.disabled = false; enter.textContent = 'Enter'; };
setTimeout(() => { enter.disabled = false; enter.textContent = 'Enter'; }, 6000);
let fade = 0, fadeT = 1;
function start() {
  if (P.mode !== 'intro') return;
  intro.style.opacity = 0; setTimeout(() => intro.classList.add('hide'), 900);
  $('#hud').classList.remove('hide');
  const a = lookAngles(new THREE.Vector3(0.6, EYE, 4.6), new THREE.Vector3(0, 1.55, ROOM.z0));
  tweenTo(new THREE.Vector3(0.6, 0, 4.0), a.yaw, a.pitch, 1.6);
  P.mode = 'walk';
  // unlock video playback on iOS inside the user gesture
  playAll();
}
enter.addEventListener('click', start);

// ---------------------------------------------------------------- loop
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
const clock = new THREE.Clock(); let t = 0, pickT = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  fade += (fadeT - fade) * (1 - Math.exp(-dt * 1.8));

  if (P.mode === 'intro') {
    // slow attract drift
    const s = t * 0.07;
    P.pos.set(0.6 + Math.sin(s) * 0.9, 0, 4.6 + Math.sin(s * 0.7) * 0.25);
    P.yaw = Math.sin(s * 0.9) * 0.32; P.pitch = -0.015;
  } else if (P.tween) {
    const tw = P.tween; tw.t += dt; const k = ease(Math.min(1, tw.t / tw.dur));
    P.pos.lerpVectors(tw.p0, tw.p1, k); P.yaw = tw.y0 + tw.dy * k; P.pitch = THREE.MathUtils.lerp(tw.pi0, tw.pi1, k);
    if (tw.t >= tw.dur) { P.tween = null; tw.done && tw.done(); }
  } else if (P.mode === 'walk' && keys.size) {
    fwd.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const v = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) v.add(fwd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) v.sub(fwd);
    if (keys.has('KeyD')) v.add(right);
    if (keys.has('KeyA')) v.sub(right);
    if (keys.has('ArrowLeft')) P.yaw += dt * 1.6;
    if (keys.has('ArrowRight')) P.yaw -= dt * 1.6;
    if (v.lengthSq()) { v.normalize().multiplyScalar(dt * (keys.has('ShiftLeft') ? 0.8 : 1.9)); P.pos.add(v); clampPos(P.pos); }
  }
  const bob = 0.006 * Math.sin(t * 0.9);
  camera.position.set(P.pos.x, EYE + bob, P.pos.z);
  camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();

  pickT += dt;
  if (pickT > 0.4) { pickT = 0; updateVideos(); }

  dust.uniforms.uTime.value = t;
  grain.uniforms.uTime.value = t; grain.uniforms.uFade.value = fade;
  composer.render(dt);
  requestAnimationFrame(frame);
}
window.__room = { P, frames, focusWork, start, camera, renderer };
frame();
