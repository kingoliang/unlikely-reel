// The Unlikely Reel — the whole site is one 3D world. Scroll = the camera's journey.
//   0 Opening: extruded title over a mirror floor, the film loop races around it, the reel stands behind.
//   1 Cat POV wall · 2 AI Animal World carousel · 3 Full episodes wall · 4 Impossible Evidence board · 5 Finale (Subscribe, Screening Room).
// Video budget: desktop plays the 6 most prominent short films, phones play 1. Lightbox open / tab hidden → everything pauses.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ALL = window.FILMS || [];
const byId = Object.fromEntries(ALL.map((f) => [f.id, f]));
const SHORTS = ALL.filter((f) => f.kind === 'short');
const pick = (s, k) => ALL.filter((f) => f.s === s && f.kind === k);
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAXPLAY = MOBILE ? 1 : 6;
const COL = { cat: '#ffcf3f', ani: '#7fe0c8', evi: '#ff6a5a', duck: '#ffcf3f', ink: '#efe8da', ink2: '#b5ad9e', ink3: '#7a7366' };
const canvas = document.getElementById('gl');
const lb = document.getElementById('lb');
const loadEl = document.getElementById('load');

// ---------------------------------------------------------------- renderer / scene
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-gl'); throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const BG = new THREE.Color(0x0b0a08);
scene.background = BG.clone();
scene.fog = new THREE.FogExp2(0x0b0a08, 0.03);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 160);

scene.add(new THREE.AmbientLight(0xfff4e6, 0.32));
const keyL = new THREE.DirectionalLight(0xfff0dc, 1.0); keyL.position.set(4, 10, 8); scene.add(keyL);
const fillL = new THREE.DirectionalLight(0xbfd8ff, 0.45); fillL.position.set(-8, 3, -40); scene.add(fillL);
function spot(color, pos, target, intensity = 90, angle = 0.6) {
  const s = new THREE.SpotLight(color, intensity, 26, angle, 0.8, 1.6);
  s.position.set(...pos); s.target.position.set(...target); scene.add(s, s.target); return s;
}

// ---------------------------------------------------------------- helpers
const loader = new THREE.TextureLoader();
const tex = (url) => { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const hits = [];                 // clickable meshes: userData.act = { film } | { href } | { top }
const obstacles = [];            // Box3s for the camera clearance check
const screens = [];              // { obj, film } — candidates for the video budget
const hoverables = [];           // { obj, glow, base } for hover feedback
const dur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function boxOf(obj) { obj.updateWorldMatrix(true, true); obstacles.push(new THREE.Box3().setFromObject(obj)); }

// canvas label → plane. lines: [{ t, font, color, y }]; w/h in world units
function label(w, h, lines, { px = 256, bg = null, align = 'left', pad = 0.06 } = {}) {
  const c = document.createElement('canvas'); c.width = Math.round(px * w); c.height = Math.round(px * h);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.textBaseline = 'alphabetic'; g.textAlign = align;
  const x = align === 'center' ? c.width / 2 : align === 'right' ? c.width - pad * px : pad * px;
  for (const L of lines) {
    let size = L.size * px; g.font = `${L.weight || 400} ${size}px ${L.family}`;
    while (g.measureText(L.t).width > c.width - 2 * pad * px && size > 8) { size -= 2; g.font = `${L.weight || 400} ${size}px ${L.family}`; }
    if (L.track) g.letterSpacing = `${L.track}px`;
    g.fillStyle = L.color; g.fillText(L.t, x, L.y * px);
    g.letterSpacing = '0px';
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: !bg, toneMapped: false, color: new THREE.Color(0.92, 0.92, 0.92), depthWrite: !!bg }));
  return m;
}
const MONO = '"JetBrains Mono", ui-monospace, monospace', SERIF = '"Instrument Serif", Georgia, serif', DISPLAY = '"Big Shoulders Display", Impact, sans-serif';

// one material per film, poster until the budget picks it
const filmMat = new Map();
function matFor(f) {
  if (filmMat.has(f.id)) return filmMat.get(f.id).mat;
  const poster = tex(f.kind === 'long' ? `media/ep/${f.id}.jpg` : `media/${f.id}.jpg`);
  const mat = new THREE.MeshBasicMaterial({ map: poster, toneMapped: false, color: new THREE.Color(0.95, 0.95, 0.95) });
  filmMat.set(f.id, { f, poster, mat, video: null, vtex: null, playing: false, score: 0 });
  return mat;
}
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x17140f, roughness: 0.45, metalness: 0.7, envMap: envTex, envMapIntensity: 0.5 });

// a framed screen with a caption plate; returns group (origin = screen centre, facing +z)
function screen(f, w, h, { code = '', sig = COL.duck, plate = true } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.08), darkMetal); body.position.z = -0.045; g.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matFor(f)); face.position.z = 0.002; g.add(face);
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matFor(f)); rear.position.z = -0.088; rear.rotation.y = Math.PI; g.add(rear);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.12, h + 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(sig).multiplyScalar(1.5), toneMapped: false }));
  glow.position.z = -0.086; glow.visible = false; g.add(glow);
  if (plate) {
    const ph = Math.max(0.42, w * 0.3);
    const p = label(w + 0.08, ph, [
      { t: `${code}${code ? '  ·  ' : ''}${dur(f.dur)}`, family: MONO, size: 0.085 * Math.min(1.6, w), color: sig, y: 0.11 * Math.min(1.6, w), track: 2 },
      { t: f.title, family: SERIF, size: 0.135 * Math.min(1.6, w), color: COL.ink, y: 0.27 * Math.min(1.6, w) },
    ], { bg: '#100e0b' });
    p.position.set(0, -h / 2 - 0.06 - ph / 2, -0.005); g.add(p);
  }
  face.userData.act = { film: f.id }; body.userData.act = { film: f.id };
  hits.push(face, body);
  hoverables.push({ key: face, obj: g, glow });
  body.userData.hk = face.userData.hk = face.uuid;
  if (f.kind === 'short') screens.push({ obj: face, film: f });
  return g;
}

// ---------------------------------------------------------------- floor + runway
let mirror = null;
if (!MOBILE) {
  mirror = new Reflector(new THREE.PlaneGeometry(240, 240), { textureWidth: Math.round(innerWidth * 0.5), textureHeight: Math.round(innerHeight * 0.5), color: 0x8a8a8a });
  mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, 0, -60); scene.add(mirror);
}
{
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#0c0b09'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(239,232,218,0.07)'; g.lineWidth = 2; g.strokeRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(80, 80); t.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({
    map: t, transparent: !!mirror, opacity: mirror ? 0.78 : 1, roughness: mirror ? 0.9 : 0.42, metalness: 0, envMap: envTex, envMapIntensity: mirror ? 0 : 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.004, -60); scene.add(floor);
}
{ // runway lights leading down the corridor
  const n = 70, m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.02, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.85, 0.3), toneMapped: false }), n * 2);
  const o = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < n; i++) for (const x of [-1.6, 1.6]) { o.position.set(x, 0.012, 6 - i * 1.8); o.updateMatrix(); m.setMatrixAt(k++, o.matrix); }
  scene.add(m);
}

// ---------------------------------------------------------------- 0 opening: loop + reel + title
const W = 0.9, H = 1.6, GAP = 0.13, MARGIN = 0.3, STRIP_H = H + 2 * MARGIN;
const hero = new THREE.Group(); hero.position.set(0, 1.45, -2.5); scene.add(hero);
const pts = [];
for (let i = 0, K = 28; i < K; i++) {
  const a = (i / K) * Math.PI * 2, r = 1 + 0.06 * Math.sin(3 * a + 0.4);
  pts.push(new THREE.Vector3(Math.cos(a) * 7.4 * r, 0.22 * Math.sin(2 * a + 0.6), Math.sin(a) * 4.9 * r));
}
const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal'); curve.arcLengthDivisions = 3000;
const L = curve.getLength(), N = Math.round(L / (W + GAP)), PITCH = L / N, UP = new THREE.Vector3(0, 1, 0);
function basis(u, P, T, B, Nn) {
  u = ((u % 1) + 1) % 1; curve.getPointAt(u, P); curve.getTangentAt(u, T);
  B.copy(UP).addScaledVector(T, -UP.dot(T)).normalize(); B.applyAxisAngle(T, 0.22 * Math.sin(u * Math.PI * 4 + 1.0)); Nn.crossVectors(T, B);
}
function filmTile(print) {
  const cw = 256, ch = Math.round((256 * STRIP_H) / PITCH), c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'), m = (ch * MARGIN) / STRIP_H, fw = (cw * W) / PITCH;
  if (!print) {
    g.fillStyle = '#14100c'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#211a13'; g.fillRect((cw - fw) / 2 - 3, m - 3, fw + 6, ch - 2 * m + 6);
    g.globalCompositeOperation = 'destination-out';
    const hw = (cw / 4) * 0.46, hh = m * 0.36;
    for (const y of [m * 0.5, ch - m * 0.5]) for (let k = 0; k < 4; k++) { g.beginPath(); g.roundRect((k + 0.5) * cw / 4 - hw / 2, y - hh / 2, hw, hh, 4); g.fill(); }
  } else {
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#e39a3c'; g.font = `500 ${Math.round(m * 0.17)}px ${MONO}`; g.textBaseline = 'middle';
    g.fillText('UNLIKELY REEL 5219', 10, m * 0.88); g.fillText('▸ SAFETY FILM', 10, ch - m * 0.12);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; if (!print) t.colorSpace = THREE.SRGBColorSpace; return t;
}
let baseTex, printTex;
const loopFrames = [];
function buildLoop() {
  baseTex = filmTile(false); printTex = filmTile(true);
  const M = N * 16, pos = [], uv = [], idx = [], P = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), Nn = new THREE.Vector3();
  for (let i = 0; i <= M; i++) {
    const u = i / M; basis(u, P, T, B, Nn);
    for (const s of [-1, 1]) { const q = P.clone().addScaledVector(B, (s * STRIP_H) / 2); pos.push(q.x, q.y, q.z); uv.push((u * L) / PITCH, s < 0 ? 0 : 1); }
    if (i < M) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  hero.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: baseTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42, envMap: envTex, envMapIntensity: 0.35, emissiveMap: printTex, emissive: 0xffffff, emissiveIntensity: 1.3 })));
  const fg = new THREE.PlaneGeometry(W, H);
  for (let i = 0; i < N; i++) {
    const f = SHORTS[i % SHORTS.length], g = new THREE.Group();
    const a = new THREE.Mesh(fg, matFor(f)); a.position.z = 0.008; const b = new THREE.Mesh(fg, matFor(f)); b.position.z = -0.008; b.rotation.y = Math.PI;
    a.userData.act = b.userData.act = { film: f.id }; g.add(a, b); hero.add(g); hits.push(a, b);
    loopFrames.push({ g, i }); screens.push({ obj: a, film: f });
  }
  // the loop as obstacle spheres → boxes
  const P2 = new THREE.Vector3();
  for (let i = 0; i < 64; i++) { curve.getPointAt(i / 64, P2); P2.add(hero.position); obstacles.push(new THREE.Box3().setFromCenterAndSize(P2.clone(), new THREE.Vector3(1.6, STRIP_H + 0.6, 1.6))); }
}
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _B = new THREE.Vector3(), _N = new THREE.Vector3(), _M = new THREE.Matrix4();
function placeLoop(shift) {
  for (const fr of loopFrames) { basis(((fr.i + 0.5) * PITCH + shift) / L, _P, _T, _B, _N); _M.makeBasis(_T, _B, _N); fr.g.quaternion.setFromRotationMatrix(_M); fr.g.position.copy(_P); }
  const o = -(shift / PITCH); baseTex.offset.x = printTex.offset.x = o - Math.floor(o);
}
const reel = new THREE.Group(); reel.position.set(0, 4.3, -9.2); scene.add(reel);
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a958d, metalness: 1, roughness: 0.28, envMap: envTex, envMapIntensity: 1.5 });
  const shape = new THREE.Shape(); shape.absarc(0, 0, 3.6, 0, Math.PI * 2, false);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0.88, 0, Math.PI * 2, true); shape.holes.push(h); }
  const hub = new THREE.Path(); hub.absarc(0, 0, 0.26, 0, Math.PI * 2, true); shape.holes.push(hub);
  const fl = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 72 }); fl.center();
  const spin = new THREE.Group(); reel.add(spin); reel.userData.spin = spin;
  for (const z of [-0.42, 0.42]) { const m = new THREE.Mesh(fl, metal); m.position.z = z; spin.add(m); }
  const pack = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.76, 128), new THREE.MeshStandardMaterial({ color: 0x1a130d, roughness: 0.28, metalness: 0.1, envMap: envTex, envMapIntensity: 0.6 }));
  pack.rotation.x = Math.PI / 2; spin.add(pack);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.05, 48), metal); core.rotation.x = Math.PI / 2; spin.add(core);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 4.3, 24), darkMetal); stand.position.set(0, -2.15, -0.7); reel.add(stand);
  boxOf(reel);
}
spot(0xffcf3f, [0, 11, 2], [0, 3.5, -4], 60, 0.55);
{ // projector beam toward the title
  const h = 30, cone = new THREE.ConeGeometry(5, h, 64, 1, true); cone.translate(0, -h / 2, 0); cone.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(cone, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(1.0, 0.86, 0.6) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vZ = position.z; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ float f = pow(abs(dot(vN,vV)),3.); float a = smoothstep(0.,5.,vZ)*(1.-smoothstep(16.,30.,vZ)); gl_FragColor = vec4(c*f*a*0.06,1.); }',
  }));
  beam.position.set(2, 9, 24); beam.lookAt(0, 4, -4); scene.add(beam);
}
const dust = (() => {
  const n = MOBILE ? 700 : 2200, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 28; p[i * 3 + 1] = Math.random() * 9; p[i * 3 + 2] = 10 - Math.random() * 135; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, color: new THREE.Color(1.4, 1.25, 1.0), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(m); return m;
})();

// ---------------------------------------------------------------- 3D type
let FONT = null;
const creamMetal = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.62, metalness: 0, envMap: envTex, envMapIntensity: 0.35, emissive: 0xefe8da, emissiveIntensity: 0.1 });
const sigMat = (hex, e = 0.2) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0, envMap: envTex, envMapIntensity: 0.35, emissive: hex, emissiveIntensity: e });
const sideMetal = new THREE.MeshStandardMaterial({ color: 0x2a2219, roughness: 0.35, metalness: 0.9, envMap: envTex, envMapIntensity: 0.8 });
function text3d(str, size, mat, { depth = size * 0.3, align = 'center', bevel = true } = {}) {
  const geo = new TextGeometry(str, { font: FONT, size, height: depth, depth, curveSegments: 6, bevelEnabled: bevel, bevelThickness: size * 0.012, bevelSize: size * 0.008, bevelSegments: 1 });
  geo.computeBoundingBox(); const bb = geo.boundingBox;
  const dx = align === 'center' ? -(bb.max.x + bb.min.x) / 2 : align === 'right' ? -bb.max.x : -bb.min.x;
  geo.translate(dx, 0, -depth / 2);
  const m = new THREE.Mesh(geo, [mat, sideMetal]); m.userData.w = bb.max.x - bb.min.x; return m;
}

// ---------------------------------------------------------------- build stations (after fonts)
const carousel = new THREE.Group();
const actors = [];   // things with per-frame motion
function buildWorld() {
  // 0 title
  const T = new THREE.Group(); T.position.set(0, 0, -2.5); scene.add(T);
  const reelMat = sigMat(0xffcf3f, 0.18);
  const l1 = text3d('THE', 0.62, creamMetal); l1.position.y = 6.75;
  const l2 = text3d('UNLIKELY', 1.75, creamMetal); l2.position.y = 5.05;
  const l3 = text3d('REEL', 1.75, reelMat); l3.position.y = 3.35;
  T.add(l1, l2, l3);
  const kick = label(7.2, 0.3, [{ t: `NOW SHOWING  ·  ${SHORTS.length} SMALL FILMS  ·  ${ALL.length - SHORTS.length} FULL EPISODES`, family: MONO, size: 0.13, color: COL.ink2, y: 0.2, track: 3 }], { align: 'center' });
  kick.position.y = 8.75; T.add(kick);
  const tag = label(7.2, 0.55, [{ t: 'Tiny films. Strange worlds. Big imagination.', family: SERIF, size: 0.36, color: COL.ink, y: 0.4 }], { align: 'center' });
  tag.position.y = 7.72; T.add(tag);
  const hint = label(4, 0.32, [{ t: (MOBILE ? 'SWIPE UP' : 'SCROLL') + ' TO ENTER  ↓', family: MONO, size: 0.12, color: COL.duck, y: 0.2, track: 4 }], { align: 'center' });
  hint.position.set(0, 0.03, 4.2); hint.rotation.x = -Math.PI / 2 + 0.35; scene.add(hint); actors.push((t, p) => { hint.material.opacity = Math.max(0, 1 - p * 18); });
  boxOf(T);

  // 1 Cat POV — right wall
  const cats = pick('cat', 'short');
  const cw = new THREE.Group(); cw.position.set(9.6, 0, -33); cw.rotation.y = -Math.PI / 2; scene.add(cw);
  const wall1 = new THREE.Mesh(new THREE.PlaneGeometry(17, 6.4), new THREE.MeshStandardMaterial({ color: 0x110f0c, roughness: 0.9 })); wall1.position.set(0, 3.2, -0.25); cw.add(wall1);
  const sw = 1.25, sh = sw * 16 / 9, gap = 0.36, span = cats.length * sw + (cats.length - 1) * gap;
  cats.forEach((f, i) => {
    const x = -span / 2 + sw / 2 + i * (sw + gap);
    const s = screen(f, sw, sh, { code: `C${String(i + 1).padStart(2, '0')}`, sig: COL.cat });
    s.position.set(x, 2.15, 0.25 + 0.022 * x * x); s.rotation.y = -Math.atan(0.044 * x); cw.add(s);
  });
  const h1 = text3d('CAT POV', 0.82, sigMat(0xffcf3f), { align: 'left' }); h1.position.set(-span / 2 + 1.2, 3.75, 0.1); cw.add(h1);
  const n1 = text3d('01', 0.82, creamMetal, { align: 'left' }); n1.position.set(-span / 2, 3.75, 0.1); cw.add(n1);
  const lg1 = label(7.5, 0.42, [{ t: 'Mochi has opinions about doors, cans, carriers and the word “vet”.', family: SERIF, size: 0.25, color: COL.ink2, y: 0.3 }], { align: 'right' });
  lg1.position.set(span / 2 - 3.75, 4.05, 0.1); cw.add(lg1);
  spot(0xffcf3f, [4, 8, -33], [9.6, 2, -33], 120, 0.75);
  boxOf(cw);

  // 2 AI Animal World — carousel, left
  const anis = pick('ani', 'short');
  carousel.position.set(-10.5, 0, -54); scene.add(carousel);
  const ring = new THREE.Group(); carousel.add(ring);
  const R = 2.75;
  anis.forEach((f, i) => {
    const a = (i / anis.length) * Math.PI * 2, s = screen(f, 1.2, 1.2 * 16 / 9, { code: `A${String(i + 1).padStart(2, '0')}`, sig: COL.ani });
    s.position.set(Math.sin(a) * R, 2.25, Math.cos(a) * R); s.rotation.y = a; ring.add(s);
  });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.75, 0.28, 96), darkMetal); plinth.position.y = 0.14; carousel.add(plinth);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(R + 0.66, 0.022, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.15, 1.0), toneMapped: false })); halo.rotation.x = Math.PI / 2; halo.position.y = 0.3; carousel.add(halo);
  const back2 = new THREE.Group(); back2.position.set(-16, 0, -54); back2.rotation.y = Math.PI / 2; scene.add(back2);
  const h2 = text3d('AI ANIMAL WORLD', 0.95, sigMat(0x7fe0c8)); h2.position.set(0, 5.0, 0); back2.add(h2);
  const n2 = label(9, 0.42, [{ t: '02  ·  ANIMALS THAT SEEM TO IGNORE THE RULES', family: MONO, size: 0.16, color: COL.ani, y: 0.28, track: 3 }], { align: 'center' }); n2.position.set(0, 6.35, 0); back2.add(n2);
  spot(0x7fe0c8, [-5, 9, -54], [-10.5, 1.5, -54], 120, 0.7);
  actors.push((dt) => { if (!REDUCED && !hoverActive(ring)) ring.rotation.y += dt * 0.12; });
  boxOf(carousel); boxOf(back2);

  // 3 Full episodes — right wall
  const eps = pick('ani', 'long');
  const ew = new THREE.Group(); ew.position.set(9.8, 0, -72); ew.rotation.y = -Math.PI / 2; scene.add(ew);
  eps.forEach((f, i) => { const s = screen(f, 3.5, 3.5 * 9 / 16, { code: `EP ${String(i + 1).padStart(2, '0')}`, sig: COL.ani }); s.position.set((i - 1) * 4.15, 2.35, 0.3 + (i === 1 ? 0 : 0.5)); s.rotation.y = (1 - i) * 0.16; ew.add(s); });
  const h3 = text3d('FULL EPISODES', 0.62, creamMetal); h3.position.set(0, 4.25, 0); ew.add(h3);
  const n3 = label(6, 0.32, [{ t: 'AI ANIMAL WORLD  ·  LONG FORM', family: MONO, size: 0.13, color: COL.ani, y: 0.22, track: 3 }], { align: 'center' }); n3.position.set(0, 5.15, 0); ew.add(n3);
  spot(0xfff0dc, [4, 8, -72], [9.8, 2, -72], 90, 0.8);
  boxOf(ew);

  // 4 Impossible Evidence — the board, left
  const evS = pick('evi', 'short')[0], evL = pick('evi', 'long');
  const ev = new THREE.Group(); ev.position.set(-10.4, 0, -94); ev.rotation.y = Math.PI / 2; scene.add(ev);
  const felt = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#2a120e'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,200,180'},${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const board = new THREE.Mesh(new THREE.BoxGeometry(13.5, 5.8, 0.12), new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 })); board.position.set(0, 3.25, -0.1); ev.add(board);
  const frameB = new THREE.Mesh(new THREE.BoxGeometry(13.8, 6.1, 0.08), darkMetal); frameB.position.set(0, 3.25, -0.18); ev.add(frameB);
  const exA = screen(evS, 1.45, 1.45 * 16 / 9, { code: 'EXHIBIT A', sig: COL.evi }); exA.position.set(0, 3.0, 0.12); ev.add(exA);
  const L1 = screen(evL[0], 3.3, 3.3 * 9 / 16, { code: 'CASE 01', sig: COL.evi }); L1.position.set(-4.4, 3.75, 0.1); L1.rotation.z = 0.025; ev.add(L1);
  const L2 = screen(evL[1], 3.3, 3.3 * 9 / 16, { code: 'CASE 02', sig: COL.evi }); L2.position.set(4.4, 3.65, 0.1); L2.rotation.z = -0.02; ev.add(L2);
  const notes = [['31 MORNINGS', -5.3, 1.25, -0.06], ['HER OWN HANDWRITING', -2.6, 5.55, 0.04], ['A CAT SHE NEVER OWNED', 2.5, 5.6, -0.05], ['1998 · THE FLOOD', 5.4, 1.35, 0.05], ['THE SMEAR', 1.9, 1.05, 0.07]];
  const pins = [];
  for (const [t, x, y, r] of notes) {
    const n = label(1.9, 0.62, [{ t, family: MONO, size: 0.14, color: '#1a1410', y: 0.38, weight: 500 }], { bg: '#e9e1cf', align: 'center' });
    n.position.set(x, y, 0.06); n.rotation.z = r; ev.add(n); pins.push(new THREE.Vector3(x, y + 0.24, 0.1));
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff6a5a, roughness: 0.4 })); pin.position.set(x, y + 0.24, 0.1); ev.add(pin);
  }
  const anchors = [new THREE.Vector3(0, 4.35, 0.14), new THREE.Vector3(-4.4, 4.7, 0.14), new THREE.Vector3(4.4, 4.6, 0.14)];
  const string = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.3, 0.25), toneMapped: false });
  const link = (a, b) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, d.length(), 5), string); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); ev.add(m); };
  [[0, 1], [1, 1], [2, 0], [3, 2], [4, 0], [0, 0]].forEach(([n, a]) => link(pins[n], anchors[a]));
  const h4 = text3d('IMPOSSIBLE EVIDENCE', 0.62, sigMat(0xff6a5a, 0.12)); h4.position.set(0, 6.55, 0); ev.add(h4);
  const n4 = label(6, 0.3, [{ t: '03  ·  A WORK OF FICTION', family: MONO, size: 0.13, color: COL.evi, y: 0.21, track: 3 }], { align: 'center' }); n4.position.set(0, 7.5, 0); ev.add(n4);
  spot(0xff6a5a, [-4, 9, -94], [-10.4, 3, -94], 150, 0.62);
  boxOf(ev);

  // 5 Finale — end wall
  const fin = new THREE.Group(); fin.position.set(0, 0, -121); scene.add(fin);
  const sub = text3d('SUBSCRIBE', 1.45, sigMat(0xffcf3f, 0.22)); sub.position.set(0, 2.5, 0); fin.add(sub);
  const subHit = new THREE.Mesh(new THREE.PlaneGeometry(sub.userData.w + 0.6, 1.9), new THREE.MeshBasicMaterial({ visible: false })); subHit.position.set(0, 3.2, 0.4); fin.add(subHit);
  subHit.userData.act = sub.userData.act = { href: 'https://www.youtube.com/@TheUnlikelyReel?sub_confirmation=1' }; hits.push(subHit, sub);
  hoverables.push({ key: subHit, obj: sub, glow: null }); subHit.userData.hk = sub.userData.hk = subHit.uuid;
  const s1 = label(8, 0.6, [{ t: 'New films most days.', family: SERIF, size: 0.46, color: COL.ink2, y: 0.45 }], { align: 'center' }); s1.position.set(0, 4.55, 0); fin.add(s1);
  const s2 = label(8, 0.34, [{ t: '@THEUNLIKELYREEL  ·  ON YOUTUBE', family: MONO, size: 0.15, color: COL.ink3, y: 0.23, track: 4 }], { align: 'center' }); s2.position.set(0, 2.0, 0); fin.add(s2);
  // doorway → /room/
  const door = new THREE.Group(); door.position.set(-5.6, 0, 0.2); door.rotation.y = 0.36; fin.add(door);
  const bar = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.0, 0.45), toneMapped: false });
  for (const [w, h, x, y] of [[0.07, 3.4, -1.1, 1.7], [0.07, 3.4, 1.1, 1.7], [2.27, 0.07, 0, 3.4]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), bar); b.position.set(x, y, 0); door.add(b); }
  const inside = label(2.2, 3.36, [
    { t: 'ENTER', family: MONO, size: 0.13, color: COL.duck, y: 1.45, track: 4 },
    { t: 'THE', family: DISPLAY, size: 0.3, color: COL.ink2, y: 1.8, weight: 800 },
    { t: 'SCREENING', family: DISPLAY, size: 0.42, color: COL.ink, y: 2.2, weight: 900 },
    { t: 'ROOM  →', family: DISPLAY, size: 0.42, color: COL.ink, y: 2.6, weight: 900 },
  ], { bg: '#070605', align: 'center' });
  inside.position.set(0, 1.7, -0.02); door.add(inside);
  inside.userData.act = { href: 'room/' }; hits.push(inside); hoverables.push({ key: inside, obj: door, glow: null }); inside.userData.hk = inside.uuid;
  // back to start
  const back = label(2.6, 0.9, [{ t: '↺  BACK TO', family: MONO, size: 0.13, color: COL.ink2, y: 0.35, track: 3 }, { t: 'THE OPENING', family: DISPLAY, size: 0.32, color: COL.ink, y: 0.72, weight: 900 }], { bg: '#100e0b', align: 'center' });
  back.position.set(5.6, 1.7, 0.2); back.rotation.y = -0.36; fin.add(back);
  back.userData.act = { top: true }; hits.push(back); hoverables.push({ key: back, obj: back, glow: null }); back.userData.hk = back.uuid;
  spot(0xffcf3f, [0, 9, -110], [0, 2.5, -121], 140, 0.7);
  // cinema marquee: chasing bulbs around SUBSCRIBE
  {
    const mw = sub.userData.w + 1.5, mh = 3.9, cy = 3.25, stepB = 0.28, P = [];
    for (let x = -mw / 2; x <= mw / 2 + 1e-6; x += stepB) { P.push([x, cy + mh / 2]); P.push([x, cy - mh / 2]); }
    for (let y = -mh / 2 + stepB; y < mh / 2 - 1e-6; y += stepB) { P.push([-mw / 2, cy + y]); P.push([mw / 2, cy + y]); }
    P.sort((a, b) => Math.atan2(a[1] - cy, a[0]) - Math.atan2(b[1] - cy, b[0]));
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), P.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    P.forEach(([x, y], i) => { o.position.set(x, y, 0.15); o.updateMatrix(); bulbs.setMatrixAt(i, o.matrix); bulbs.setColorAt(i, c.setRGB(1.6, 1.2, 0.45)); });
    fin.add(bulbs);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.3, mh + 0.3, 0.12), darkMetal); rim.position.set(0, cy, 0.02); fin.add(rim);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(mw - 0.2, mh - 0.2), new THREE.MeshStandardMaterial({ color: 0x070605, roughness: 0.8 })); inner.position.set(0, cy, 0.085); fin.add(inner);
    sub.position.z = 0.2; s1.position.set(0, cy + mh / 2 + 0.6, 0.1); s2.position.set(0, cy - mh / 2 - 0.45, 0.1);
    actors.push((dt) => { const t = performance.now() / 1000; for (let i = 0; i < P.length; i++) { const on = ((i + Math.floor(t * 9)) % 4) !== 0; bulbs.setColorAt(i, on ? c.setRGB(1.7, 1.25, 0.45) : c.setRGB(0.25, 0.17, 0.06)); } bulbs.instanceColor.needsUpdate = true; });
  }
  const endWall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ color: 0x0e0d0b, roughness: 0.9 })); endWall.position.set(0, 6, -0.6); fin.add(endWall);
  boxOf(fin);

  // corridor signage: the channel line, standing on the left as you come in
  const neon = []; window.__neon = neon;
  const lines = [['TINY FILMS.', 0xffcf3f], ['STRANGE WORLDS.', 0x7fe0c8], ['BIG IMAGINATION.', 0xff6a5a]];
  lines.forEach(([t, c], i) => {
    const m = text3d(t, 0.78, sigMat(c, 0.55), { align: 'left' });
    m.position.set(-7.2, 4.4 - i * 1.05, -17.6 - i * 2.0); m.rotation.y = Math.PI / 2 - 0.25; scene.add(m); boxOf(m); m.userData.box = obstacles[obstacles.length - 1]; neon.push(m);
    const l = new THREE.PointLight(c, 6, 5, 2); l.position.set(-6.4, 4.0 - i * 1.05, -17.5 - i * 2.2); scene.add(l);
  });

  // overhead: a straight run of film carrying every poster down the whole route
  const run = new THREE.Group(); scene.add(run);
  const fw = 0.9, fh = 1.6, step = 1.06, z0 = -11, z1 = -116, n = Math.floor((z0 - z1) / step);
  const edge = new THREE.MeshStandardMaterial({ color: 0x15110c, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
  const fg = new THREE.PlaneGeometry(fw, fh), eg = new THREE.PlaneGeometry(step, fh + 0.5);
  for (let i = 0; i < n; i++) {
    const z = z0 - i * step, y = 7.0 + 0.35 * Math.sin(i * 0.21), f = SHORTS[i % SHORTS.length], rz = 0.06 * Math.sin(i * 0.21 + 1.2);
    const a = new THREE.Mesh(fg, matFor(f)); a.position.set(0.012, y, z); a.rotation.set(0, Math.PI / 2, rz);
    const b = new THREE.Mesh(fg, matFor(f)); b.position.set(-0.012, y, z); b.rotation.set(0, -Math.PI / 2, -rz);
    const e = new THREE.Mesh(eg, edge); e.position.set(0, y, z); e.rotation.set(0, Math.PI / 2, rz);
    run.add(e, a, b);
  }
  obstacles.push(new THREE.Box3(new THREE.Vector3(-0.6, 6.0, z1), new THREE.Vector3(0.6, 8.2, z0)));
}

// ---------------------------------------------------------------- camera journey
// each key: focus point, yaw (deg, 0 = down the corridor, +90 = right wall), pitch, W = width that must fit in frame
let OBL = 50; const NEON = { s: 0.48, c: [-7.0, 3.8, -18.5] };
const KEYS = [
  { f: [0, 4.9, -2.5], yaw: 0, pitch: -4, W: 11 },            // opening
  { f: [0, 2.6, -3.5], yaw: 32, pitch: -20, W: 17 },          // rise and orbit
  { pos: [9.2, 5.0, -2.0], yaw: -40, pitch: -10 },            // swing wide of the title…
  { pos: [6.4, 4.4, -10.5], yaw: -14, pitch: -6 },            // …and round the reel's right side
  { f: [-6.6, 3.3, -20.5], yaw: -62, pitch: -3, W: 9.5, tall: { yaw: -20, d: 7.5 } },   // the channel line, in neon
  { f: [9.6, 2.5, -33], yaw: 90, pitch: -3, W: 14.5 },        // Cat POV wall
  { f: [9.4, 2.1, -29.6], yaw: 62, pitch: -3, W: 6 },         // sweep along the cats
  { f: [-10.5, 2.6, -54], yaw: -90, pitch: -4, W: 12.5 },     // carousel
  { f: [9.8, 2.6, -72], yaw: 90, pitch: -3, W: 13.5 },        // full episodes
  { f: [-10.4, 3.6, -94], yaw: -90, pitch: -3, W: 14 },       // evidence board
  { f: [-10.4, 3.4, -96.5], yaw: -112, pitch: -3, W: 10 },    // drift past the board
  { f: [0, 3.0, -121], yaw: 0, pitch: -2, W: 16 },            // finale
];
const STOPS = { opening: 0, cat: 5, ani: 7, eps: 8, evi: 9, end: 11 };
const D2R = Math.PI / 180;
let kPos = [];
function dirOf(yaw, pitch, out = new THREE.Vector3()) { return out.set(Math.sin(yaw * D2R) * Math.cos(pitch * D2R), Math.sin(pitch * D2R), -Math.cos(yaw * D2R) * Math.cos(pitch * D2R)); }
function layoutKeys() {
  const tanH = Math.tan((camera.fov * D2R) / 2) * camera.aspect;
  const tall = camera.aspect < 1;
  // neon tagline: on landscape it stands along the left wall; on portrait it squares up to the camera as one block
  const neon = window.__neon || [], K4 = KEYS[4];
  if (tall && neon.length) {
    const th = -K4.tall.yaw * D2R, ax = new THREE.Vector3(Math.cos(th), 0, -Math.sin(th));
    const maxW = Math.max(...neon.map((m) => m.userData.w)) * NEON.s, lh = 1.1 * NEON.s, C = new THREE.Vector3(...NEON.c);
    neon.forEach((m, i) => { m.scale.setScalar(NEON.s); m.rotation.y = th; m.position.copy(C).addScaledVector(ax, -maxW / 2); m.position.y += lh * (1 - i) - 0.3 * NEON.s; });
    K4.tall.f = NEON.c;
  } else neon.forEach((m, i) => { m.scale.setScalar(1); m.rotation.y = Math.PI / 2 - 0.25; m.position.set(-7.2, 4.4 - i * 1.05, -17.6 - i * 2.0); });
  neon.forEach((m) => { m.updateWorldMatrix(true, true); m.userData.box?.setFromObject(m); });
  KEYS.forEach((k) => { k.yaw = k.yaw0 ?? (k.yaw0 = k.yaw); });
  kPos = KEYS.map((k) => {
    if (k.pos) return new THREE.Vector3(...k.pos);
    let d = k.W / 2 / tanH;
    const side = Math.abs(k.yaw0) > 60;
    if (tall && k.tall) { k.yaw = k.tall.yaw; return new THREE.Vector3(...(k.tall.f || k.f)).addScaledVector(dirOf(k.yaw, k.pitch), -k.tall.d); }
    if (side && tall && Math.abs(k.yaw0) >= 85) {
      // portrait can't back far enough from a side wall: look at it obliquely from up-corridor,
      // so the whole wall fits by perspective instead of width
      k.yaw = k.yaw0 - Math.sign(k.yaw0) * OBL;
      const lat = Math.abs(Math.sin(k.yaw * D2R));
      d = Math.min(d, 15.5 / lat);
    } else if (side) d = Math.min(d, 15.5);              // never back into the opposite wall
    else d = Math.min(d, 26);
    return new THREE.Vector3(...k.f).addScaledVector(dirOf(k.yaw, k.pitch), -d);
  });
}
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
const smooth = (x) => x * x * (3 - 2 * x);
function rig(p, outPos, outDir) {
  const s = p * (KEYS.length - 1), k = Math.min(KEYS.length - 2, Math.floor(s)), t = smooth(s - k);
  const i0 = Math.max(0, k - 1), i3 = Math.min(KEYS.length - 1, k + 2);
  for (let c = 0; c < 3; c++) outPos.setComponent(c, cr(kPos[i0].getComponent(c), kPos[k].getComponent(c), kPos[k + 1].getComponent(c), kPos[i3].getComponent(c), t));
  const yaw = cr(KEYS[i0].yaw, KEYS[k].yaw, KEYS[k + 1].yaw, KEYS[i3].yaw, t), pitch = cr(KEYS[i0].pitch, KEYS[k].pitch, KEYS[k + 1].pitch, KEYS[i3].pitch, t);
  dirOf(yaw, pitch, outDir);
}

// ---------------------------------------------------------------- post
let composer = null;
if (!MOBILE) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.5, 1.0));
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec2 c = vUv-.5; float d = dot(c,c); vec2 o = c*d*.018; vec3 col = vec3(texture2D(tDiffuse,vUv+o).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-o).b); col *= 1.-smoothstep(.12,.6,d)*.55; gl_FragColor = vec4(col,1.); }',
  }));
  composer.addPass(new OutputPass());
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 52 : 38; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
  if (mirror) mirror.getRenderTarget().setSize(Math.round(w * 0.5), Math.round(h * 0.5));
  layoutKeys();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- interaction
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
let hovered = null;
function hitAt(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(hits, false)[0]?.object || null; }
function hoverActive(group) { return hovered && hovered.obj && group.getObjectById(hovered.obj.id); }
function setHover(o) {
  const h = o ? hoverables.find((x) => x.key.uuid === o.userData.hk) || { key: o, obj: o.parent?.type === 'Group' && o.parent !== hero ? o.parent : null, glow: null, loop: true } : null;
  if (h?.key === hovered?.key) return;
  if (hovered?.glow) hovered.glow.visible = false;
  hovered = h; canvas.style.cursor = o ? 'pointer' : '';
  if (h?.glow) h.glow.visible = true;
}
function act(o) {
  const a = o?.userData.act; if (!a) return;
  if (a.film) openFilm(a.film);
  else if (a.href) { if (a.href.startsWith('http')) open(a.href, '_blank', 'noopener'); else location.href = a.href; }
  else if (a.top) scrollTo({ top: 0, behavior: 'smooth' });
}
addEventListener('pointermove', (e) => { mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); if (e.pointerType === 'mouse' && lb.hidden) setHover(hitAt(e.clientX, e.clientY)); });
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), sy: scrollY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) + Math.abs(scrollY - down.sy);
  if (moved < 12) act(hitAt(e.clientX, e.clientY)); down = null;   // distance only: slow GPUs stretch the press
});

// ---------------------------------------------------------------- lightbox (the only HTML UI)
const order = ALL.map((f) => f.id); let cur = -1, lastFocus = null;
function openFilm(id) {
  const f = byId[id]; if (!f) return; cur = order.indexOf(id);
  const wide = f.kind === 'long', v = document.getElementById('lbV');
  v.className = 'lb-vid' + (wide ? ' wide' : '');
  v.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${f.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="${f.title.replace(/"/g, '&quot;')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  document.getElementById('lbS').textContent = f.series; document.getElementById('lbT').textContent = f.title; document.getElementById('lbN').textContent = f.note;
  document.getElementById('lbY').href = wide ? `https://www.youtube.com/watch?v=${f.id}` : `https://www.youtube.com/shorts/${f.id}`;
  lb.style.setProperty('--sig', COL[f.s]);
  if (lb.hidden) { lastFocus = document.activeElement; lb.hidden = false; document.body.classList.add('lb-open'); }
  stopAll(); setHover(null); document.getElementById('lbX').focus();
}
function closeFilm() { lb.hidden = true; document.getElementById('lbV').innerHTML = ''; document.body.classList.remove('lb-open'); lastFocus?.focus?.(); }
const stepFilm = (d) => openFilm(order[(cur + d + order.length) % order.length]);
document.getElementById('lbX').addEventListener('click', closeFilm);
document.getElementById('lbP').addEventListener('click', () => stepFilm(-1));
document.getElementById('lbNx').addEventListener('click', () => stepFilm(1));
lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-body')) closeFilm(); });
addEventListener('keydown', (e) => { if (lb.hidden) return; if (e.key === 'Escape') closeFilm(); else if (e.key === 'ArrowRight') stepFilm(1); else if (e.key === 'ArrowLeft') stepFilm(-1); });
// the hidden text programme (screen readers / keyboard): links open the lightbox and fly the camera to their stop
document.querySelectorAll('.sr a[data-id]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openFilm(a.dataset.id); }));
document.querySelectorAll('.sr [data-stop]').forEach((el) => el.addEventListener('focusin', () => goStop(el.dataset.stop)));
function goStop(name) { const k = STOPS[name]; if (k == null) return; scrollTo({ top: (k / (KEYS.length - 1)) * (document.documentElement.scrollHeight - innerHeight), behavior: 'smooth' }); }

// ---------------------------------------------------------------- video budget
function ensureVideo(fm) {
  if (fm.video) return fm.video;
  const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = `media/${fm.f.id}.mp4`;
  fm.vtex = new THREE.VideoTexture(v); fm.vtex.colorSpace = THREE.SRGBColorSpace;
  v.addEventListener('playing', () => { if (fm.playing) { fm.mat.map = fm.vtex; fm.mat.needsUpdate = true; } });
  fm.video = v; return v;
}
function startFilm(fm) { fm.playing = true; const v = ensureVideo(fm); const p = v.play(); if (p) p.catch(() => {}); if (v.readyState >= 2 && fm.mat.map !== fm.vtex) { fm.mat.map = fm.vtex; fm.mat.needsUpdate = true; } }
function stopFilm(fm) { fm.playing = false; if (fm.video && !fm.video.paused) fm.video.pause(); if (fm.mat.map !== fm.poster) { fm.mat.map = fm.poster; fm.mat.needsUpdate = true; } }
function stopAll() { for (const fm of filmMat.values()) stopFilm(fm); }
const _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _to = new THREE.Vector3();
function chooseVideos() {
  for (const fm of filmMat.values()) fm.score = 0;
  for (const s of screens) {
    s.obj.getWorldPosition(_w); s.obj.getWorldQuaternion(_q);
    _to.copy(camera.position).sub(_w); const d = _to.length(); _to.divideScalar(d);
    const facing = _n.set(0, 0, 1).applyQuaternion(_q).dot(_to);
    if (facing < 0.25 || d > 30) continue;
    _w.project(camera); if (_w.z > 1 || Math.abs(_w.x) > 1.05 || Math.abs(_w.y) > 1.05) continue;
    const fm = filmMat.get(s.film.id), sc = (facing / d) * (1.2 - 0.5 * Math.hypot(_w.x, _w.y));
    if (sc > fm.score) fm.score = sc;
  }
  if (MOBILE) for (const fm of filmMat.values()) if (fm.playing) fm.score *= 1.35;
  const chosen = new Set([...filmMat.values()].filter((fm) => fm.score > 0 && fm.f.kind === 'short').sort((a, b) => b.score - a.score).slice(0, MAXPLAY));
  for (const fm of filmMat.values()) (chosen.has(fm) ? startFilm : stopFilm)(fm);
}

// ---------------------------------------------------------------- tint per stop
const TINTS = [[0, 0x0b0a08], [5, 0x100c06], [7, 0x06100e], [8, 0x080b0a], [9, 0x120706], [11, 0x0b0a08]].map(([k, c]) => [k / (KEYS.length - 1), new THREE.Color(c)]);
function tintAt(p, out) { let i = 0; while (i < TINTS.length - 2 && p > TINTS[i + 1][0]) i++; const [a, ca] = TINTS[i], [b, cb] = TINTS[i + 1]; return out.copy(ca).lerp(cb, Math.min(1, Math.max(0, (p - a) / (b - a)))); }

// ---------------------------------------------------------------- main loop
let target = 0, prog = 0, shift = 0, speed = 0.32, chooseT = 0, last = performance.now(), ready = false;
const camP = new THREE.Vector3(), camD = new THREE.Vector3(), tint = new THREE.Color(), look = new THREE.Vector3();
const readScroll = () => { const max = document.documentElement.scrollHeight - innerHeight; target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0; };
addEventListener('scroll', readScroll, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!ready || document.hidden || !lb.hidden) return;
  prog += (target - prog) * Math.min(1, dt * (REDUCED ? 20 : 3.2));
  const sp = REDUCED ? 0.05 : hovered?.loop ? 0.05 : 0.32; speed += (sp - speed) * Math.min(1, dt * 3);
  shift = (shift + speed * dt) % L; placeLoop(shift);
  reel.userData.spin.rotation.z -= speed * dt * 0.3;
  dust.rotation.y += dt * 0.004;
  for (const a of actors) a(dt, prog);
  for (const h of hoverables) { const s = h === hovered ? 1.05 : 1; h.obj.scale.lerp(_w.set(s, s, s), Math.min(1, dt * 8)); }
  rig(prog, camP, camD);
  mouseS.lerp(MOBILE || !lb.hidden ? _n.set(0, 0, 0) : mouse, Math.min(1, dt * 2.5));
  camera.position.copy(camP); camera.position.y += -mouseS.y * 0.25;
  look.copy(camP).addScaledVector(camD, 10); look.x += mouseS.x * 0.9; look.y -= mouseS.y * 0.4;
  camera.lookAt(look);
  tintAt(prog, tint); scene.background.copy(tint); scene.fog.color.copy(tint);
  if ((chooseT -= dt) <= 0) { chooseT = 0.35; if (!REDUCED) chooseVideos(); }
  composer ? composer.render() : renderer.render(scene, camera);
}

// ---------------------------------------------------------------- boot
async function boot() {
  const fontsReady = Promise.race([Promise.all([`400 40px ${SERIF}`, `400 40px ${MONO}`, `500 40px ${MONO}`, `900 40px ${DISPLAY}`, `800 40px ${DISPLAY}`].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3500))]);
  const typeface = fetch('media/fonts/bsd900.typeface.json').then((r) => r.json());
  const [, json] = await Promise.all([fontsReady, typeface]);
  FONT = new FontLoader().parse(json);
  buildLoop(); buildWorld(); resize(); readScroll(); prog = target;
  THREE.DefaultLoadingManager.onLoad = () => loadEl.classList.add('done');
  setTimeout(() => loadEl.classList.add('done'), 6000);
  ready = true; document.documentElement.classList.add('gl-on');
  requestAnimationFrame(tick);
}
boot();

// ---------------------------------------------------------------- debug / tests
window.__world = {
  MOBILE, KEYS, STOPS, goStop, get prog() { return prog; },
  playing: () => [...filmMat.values()].filter((f) => f.playing).map((f) => f.f.id),
  shown: () => [...filmMat.values()].filter((f) => f.vtex && f.mat.map === f.vtex).map((f) => f.f.id),
  // min distance from the camera path to any obstacle (sampled), to make sure the camera never flies through things
  clearance(n = 600) {
    const P = new THREE.Vector3(), D = new THREE.Vector3(); let worst = { d: 1e9 };
    for (let i = 0; i <= n; i++) { rig(i / n, P, D); for (let j = 0; j < obstacles.length; j++) { const d = obstacles[j].distanceToPoint(P); if (d < worst.d) worst = { d: +d.toFixed(2), p: +(i / n).toFixed(3), j, pos: P.toArray().map((v) => +v.toFixed(1)) }; } }
    return worst;
  },
  tight(n = 800, lim = 0.5) {
    const P = new THREE.Vector3(), D = new THREE.Vector3(), out = [];
    for (let i = 0; i <= n; i++) { rig(i / n, P, D); let m = 1e9, mj = -1; obstacles.forEach((b, j) => { const d = b.distanceToPoint(P); if (d < m) { m = d; mj = j; } }); if (m < lim) out.push([+(i / n).toFixed(3), mj, +m.toFixed(2)]); }
    return out;
  },
  hitAt, act, camera,
  relayout: () => layoutKeys(),
  neonFit(k = 4) {   // NDC extents of the neon lines as seen from keyframe k
    const P = new THREE.Vector3(), D = new THREE.Vector3(), cam = camera.clone();
    rig(k / (KEYS.length - 1), P, D); cam.position.copy(P); cam.lookAt(P.clone().add(D)); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9; const v = new THREE.Vector3();
    (window.__neon || []).forEach((m) => { m.updateMatrixWorld(); const b = m.geometry.boundingBox; for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } });
    return [x0, x1, y0, y1].map((n) => +n.toFixed(2));
  },
  setNeon(o) { Object.assign(KEYS[4].tall, o.tall || {}); Object.assign(NEON, o.neon || {}); layoutKeys(); },
  snap(p) { const max = document.documentElement.scrollHeight - innerHeight; scrollTo(0, p * max); target = prog = p; },
};
