// The Unlikely Reel — 3D opening: one endless film strip looping through space around a spinning reel.
// Every short film is a frame on the strip. Scroll flies the camera into the loop; hover a frame to read it, click to watch.
// Video budget: desktop plays the 6 most prominent films, phones play 1 (same rule as /room/).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FILMS = (window.FILMS || []).filter((f) => f.kind === 'short');
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAXPLAY = MOBILE ? 1 : 6;
const section = document.querySelector('.hero3d');
const stage = section.querySelector('.stage');
const canvas = document.getElementById('gl');
const lb = document.getElementById('lb');
const hudNo = document.getElementById('hudNo'), hudT = document.getElementById('hudT');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const BG = 0x0b0a08;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.032);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environmentIntensity = 1;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);

// ---------------------------------------------------------------- lights
scene.add(new THREE.AmbientLight(0xfff4e6, 0.35));
const fill = new THREE.DirectionalLight(0xbfd8ff, 0.7); fill.position.set(-6, 2, 8); scene.add(fill);
const key = new THREE.DirectionalLight(0xfff0dc, 1.2); key.position.set(5, 8, 6); scene.add(key);
const teal = new THREE.PointLight(0x7fe0c8, 30, 16, 2); teal.position.set(-6, 2, -5); scene.add(teal);
const red = new THREE.PointLight(0xff6a5a, 26, 16, 2); red.position.set(6.5, -1, -4); scene.add(red);
const duck = new THREE.SpotLight(0xffcf3f, 70, 20, 0.55, 0.85, 2); duck.position.set(0, 7.5, 3.5); scene.add(duck, duck.target);

// ---------------------------------------------------------------- the loop
const W = 0.9, H = 1.6, GAP = 0.13, MARGIN = 0.3;          // frame 9:16, sprocket margins
const STRIP_H = H + 2 * MARGIN;
const loop = new THREE.Group(); loop.rotation.x = 0.16; scene.add(loop);
const pts = [];
for (let i = 0, K = 28; i < K; i++) {
  const a = (i / K) * Math.PI * 2, r = 1 + 0.07 * Math.sin(3 * a + 0.4);
  pts.push(new THREE.Vector3(Math.cos(a) * 7.2 * r, 0.75 * Math.sin(2 * a + 0.6), Math.sin(a) * 4.7 * r));
}
const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
curve.arcLengthDivisions = 3000;
const L = curve.getLength();
const N = Math.round(L / (W + GAP));
const PITCH = L / N;

const UP = new THREE.Vector3(0, 1, 0);
function basis(u, P, T, B, Nn) {
  u = ((u % 1) + 1) % 1;
  curve.getPointAt(u, P); curve.getTangentAt(u, T);
  B.copy(UP).addScaledVector(T, -UP.dot(T)).normalize();
  B.applyAxisAngle(T, 0.36 * Math.sin(u * Math.PI * 4 + 1.0));   // gentle roll along the loop
  Nn.crossVectors(T, B);
}

// film base texture: one tile = one frame pitch; 4 perforations per edge (35mm-ish)
function tileCanvas(print) {
  const cw = 256, ch = Math.round((256 * STRIP_H) / PITCH);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  const m = (ch * MARGIN) / STRIP_H, fw = (cw * W) / PITCH;
  if (!print) {
    g.fillStyle = '#14100c'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#211a13'; g.fillRect((cw - fw) / 2 - 3, m - 3, fw + 6, ch - 2 * m + 6);
    g.globalCompositeOperation = 'destination-out';
    const hw = cw / 4 * 0.46, hh = m * 0.36;
    for (const y of [m * 0.5, ch - m * 0.5]) for (let k = 0; k < 4; k++) {
      const x = (k + 0.5) * cw / 4;
      g.beginPath(); g.roundRect(x - hw / 2, y - hh / 2, hw, hh, 4); g.fill();
    }
  } else {
    g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = '#e39a3c'; g.font = `500 ${Math.round(m * 0.17)}px "JetBrains Mono", monospace`; g.textBaseline = 'middle';
    g.fillText('UNLIKELY REEL 5219', 10, m * 0.88);
    g.fillText('▸ SAFETY FILM', 10, ch - m * 0.12);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (!print) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const baseTex = tileCanvas(false), printTex = tileCanvas(true);

{ // ribbon geometry
  const M = Math.max(600, N * 16), pos = [], uv = [], idx = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), Nn = new THREE.Vector3();
  for (let i = 0; i <= M; i++) {
    const u = i / M; basis(u, P, T, B, Nn);
    for (const s of [-1, 1]) { const q = P.clone().addScaledVector(B, (s * STRIP_H) / 2); pos.push(q.x, q.y, q.z); uv.push((u * L) / PITCH, s < 0 ? 0 : 1); }
    if (i < M) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: baseTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42, metalness: 0.0,
    envMap: envTex, envMapIntensity: 0.35, emissiveMap: printTex, emissive: 0xffffff, emissiveIntensity: 1.35,
  });
  loop.add(new THREE.Mesh(geo, mat));
}

// films: one shared material per film (poster until it is chosen to play)
const loader = new THREE.TextureLoader();
const films = FILMS.map((f) => {
  const poster = loader.load(`media/${f.id}.jpg`);
  poster.colorSpace = THREE.SRGBColorSpace; poster.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: poster, color: new THREE.Color(1.0, 1.0, 1.0), toneMapped: false });
  return { f, poster, mat, video: null, vtex: null, playing: false, score: 0 };
});
const frameGeo = new THREE.PlaneGeometry(W, H);
const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.3, 0.3), toneMapped: false });
const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.07, H + 0.07), glowMat);
glow.visible = false;
const frames = [], hitMeshes = [];
for (let i = 0; i < N; i++) {
  const film = films[i % films.length];
  const g = new THREE.Group();
  const front = new THREE.Mesh(frameGeo, film.mat); front.position.z = 0.008;
  const back = new THREE.Mesh(frameGeo, film.mat); back.position.z = -0.008; back.rotation.y = Math.PI;
  front.userData.k = back.userData.k = i;
  g.add(front, back); loop.add(g);
  frames.push({ g, film, i }); hitMeshes.push(front, back);
}
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _B = new THREE.Vector3(), _N = new THREE.Vector3(), _M = new THREE.Matrix4();
function placeFrames(shift) {
  for (const fr of frames) {
    basis(((fr.i + 0.5) * PITCH + shift) / L, _P, _T, _B, _N);
    _M.makeBasis(_T, _B, _N); fr.g.quaternion.setFromRotationMatrix(_M); fr.g.position.copy(_P);
  }
  const o = -(shift / PITCH); baseTex.offset.x = printTex.offset.x = o - Math.floor(o);
}

// ---------------------------------------------------------------- the reel
const reel = new THREE.Group(); reel.position.set(0, 0.35, -0.6); reel.rotation.y = -0.38; scene.add(reel);
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a958d, metalness: 1, roughness: 0.3, envMap: envTex, envMapIntensity: 1.6 });
  const shape = new THREE.Shape(); shape.absarc(0, 0, 3.0, 0, Math.PI * 2, false);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * 1.82, Math.sin(a) * 1.82, 0.74, 0, Math.PI * 2, true); shape.holes.push(h); }
  const hub = new THREE.Path(); hub.absarc(0, 0, 0.22, 0, Math.PI * 2, true); shape.holes.push(hub);
  const flangeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 64 });
  flangeGeo.center();
  const spin = new THREE.Group(); reel.add(spin); reel.userData.spin = spin;
  for (const z of [-0.36, 0.36]) { const m = new THREE.Mesh(flangeGeo, metal); m.position.z = z; spin.add(m); }
  const pack = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.64, 128, 1, false),
    new THREE.MeshStandardMaterial({ color: 0x1a130d, roughness: 0.28, metalness: 0.1, envMap: envTex, envMapIntensity: 0.6 }));
  pack.rotation.x = Math.PI / 2; spin.add(pack);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 48), metal); core.rotation.x = Math.PI / 2; spin.add(core);
  duck.target.position.copy(reel.position);
}

// ---------------------------------------------------------------- air: projector beam + dust
{
  const h = 26, cone = new THREE.ConeGeometry(4.2, h, 64, 1, true);
  cone.translate(0, -h / 2, 0); cone.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(cone, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { c: { value: new THREE.Color(1.0, 0.86, 0.6) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vZ = position.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; varying vec3 vN; varying vec3 vV; varying float vZ;
      void main(){ float f = pow(abs(dot(vN, vV)), 3.0); float along = smoothstep(0.0, 4.0, vZ) * (1.0 - smoothstep(14.0, 26.0, vZ));
        gl_FragColor = vec4(c * f * along * 0.075, 1.0); }`,
  }));
  beam.position.set(1.8, 5.5, 19); beam.lookAt(0, 0.2, -1.5); scene.add(beam);
}
const dust = (() => {
  const n = MOBILE ? 500 : 1500, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 20; p[i * 3 + 1] = Math.random() * 9 - 3.5; p[i * 3 + 2] = Math.random() * 20 - 7; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.03, color: new THREE.Color(1.5, 1.3, 1.0), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts); return pts;
})();

// ---------------------------------------------------------------- post
let composer = null;
if (!MOBILE) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 1.0)); // only >1.0 blooms: print, glints, hover rim
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, amt: { value: 0.0045 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float amt; varying vec2 vUv;
      void main(){ vec2 c = vUv - .5; float d = dot(c, c); vec2 o = c * d * amt * 4.;
        vec3 col = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
        col *= 1. - smoothstep(.12, .6, d) * .55; gl_FragColor = vec4(col, 1.); }`,
  }));
  composer.addPass(new OutputPass());
}

// ---------------------------------------------------------------- camera choreography (scroll progress p: 0 → 1)
// landscape: title owns the left ~45%, so the opening shot sits off to the left of the loop
const KEYS_WIDE = [
  { p: 0.0, pos: [-6.0, 2.2, 13.2], at: [-6.0, -1.2, 0] },
  { p: 0.45, pos: [2.5, 4.8, 10.5], at: [1.5, -0.4, 1.0] },
  { p: 0.78, pos: [6.5, 1.4, 9.0], at: [3.0, -0.1, 3.6] },
  { p: 1.0, pos: [9.5, 0.6, -1.0], at: [5.5, 0.2, 4.0] },   // skim alongside the strip as it sweeps past
];
// portrait: title on top, loop in the lower half
const KEYS_TALL = [
  { p: 0.0, pos: [0, 4.6, 19.5], at: [0, 2.6, 0] },
  { p: 0.45, pos: [2.0, 6.0, 13.0], at: [1.0, -0.4, 1.0] },
  { p: 0.78, pos: [7.0, 1.8, 10.5], at: [3.0, -0.1, 3.6] },
  { p: 1.0, pos: [9.8, 0.8, -0.5], at: [5.6, 0.2, 4.2] },
];
let KEYS = KEYS_WIDE;
const ease = (x) => x * x * (3 - 2 * x);
const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
// Catmull-Rom through the keys so the move never stops dead at a key
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
function rig(p, out, outAt) {
  let k = 0; while (k < KEYS.length - 2 && p > KEYS[k + 1].p) k++;
  const a = KEYS[k], b = KEYS[k + 1], a0 = KEYS[Math.max(0, k - 1)], b1 = KEYS[Math.min(KEYS.length - 1, k + 2)];
  let t = Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p)));
  if (k === 0) t = ease(t * 0.5) * 2 * 0.5 + t * 0.5;   // gentler first metres of the move
  for (let i = 0; i < 3; i++) {
    out.setComponent(i, cr(a0.pos[i], a.pos[i], b.pos[i], b1.pos[i], t));
    outAt.setComponent(i, cr(a0.at[i], a.at[i], b.at[i], b1.at[i], t));
  }
}
let distK = 1;
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 50 : 38; distK = 1; KEYS = camera.aspect < 1 ? KEYS_TALL : KEYS_WIDE; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- interaction
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
let hovered = null, pointerIn = false;
function pick(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hitMeshes, false)[0];
  return hit ? frames[hit.object.userData.k] : null;
}
function setHover(fr) {
  if (fr === hovered) return;
  hovered = fr;
  if (fr) {
    fr.g.add(glow); glow.visible = true; stage.style.cursor = 'pointer';
    const n = FILMS.indexOf(fr.film.f) + 1;
    hudNo.textContent = `${fr.film.f.series} · ${String(n).padStart(2, '0')} / ${String(FILMS.length).padStart(2, '0')} · ${Math.floor(fr.film.f.dur / 60)}:${String(fr.film.f.dur % 60).padStart(2, '0')}`;
    hudT.textContent = fr.film.f.title;
    stage.classList.add('hovering');
  } else {
    glow.visible = false; stage.style.cursor = '';
    stage.classList.remove('hovering');
  }
}
stage.addEventListener('pointermove', (e) => {
  pointerIn = true;
  mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  if (e.pointerType === 'mouse') setHover(pick(e.clientX, e.clientY));
});
stage.addEventListener('pointerleave', () => { pointerIn = false; setHover(null); });
stage.addEventListener('click', (e) => {
  if (e.target.closest('a, button')) return;
  const fr = pick(e.clientX, e.clientY);
  if (fr && window.__reel) window.__reel.open(fr.film.f.id);
});

// ---------------------------------------------------------------- video budget
function ensureVideo(fm) {
  if (fm.video) return fm.video;
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
  v.src = `media/${fm.f.id}.mp4`;
  fm.vtex = new THREE.VideoTexture(v); fm.vtex.colorSpace = THREE.SRGBColorSpace;
  v.addEventListener('playing', () => { if (fm.playing) { fm.mat.map = fm.vtex; fm.mat.needsUpdate = true; } });
  fm.video = v; return v;
}
function startFilm(fm) { fm.playing = true; const v = ensureVideo(fm); const p = v.play(); if (p) p.catch(() => {}); if (v.readyState >= 2) { fm.mat.map = fm.vtex; fm.mat.needsUpdate = true; } }
function stopFilm(fm) { fm.playing = false; if (fm.video && !fm.video.paused) fm.video.pause(); if (fm.mat.map !== fm.poster) { fm.mat.map = fm.poster; fm.mat.needsUpdate = true; } }
const _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _toCam = new THREE.Vector3();
function chooseVideos() {
  for (const fm of films) fm.score = 0;
  for (const fr of frames) {
    fr.g.getWorldPosition(_w); fr.g.getWorldQuaternion(_q);
    _toCam.copy(camera.position).sub(_w); const d = _toCam.length(); _toCam.divideScalar(d);
    const facing = Math.abs(_n.set(0, 0, 1).applyQuaternion(_q).dot(_toCam));
    _w.project(camera);
    if (_w.z > 1 || Math.abs(_w.x) > 1.05 || Math.abs(_w.y) > 1.05 || facing < 0.25 || d > 22) continue;
    const s = (facing / d) * (1.2 - 0.5 * Math.hypot(_w.x, _w.y));
    if (s > fr.film.score) fr.film.score = s;
  }
  if (MOBILE) for (const fm of films) if (fm.playing) fm.score *= 1.35;   // sticky: don't flip-flop
  const pickSet = new Set(films.filter((fm) => fm.score > 0).sort((a, b) => b.score - a.score).slice(0, MAXPLAY));
  for (const fm of films) (pickSet.has(fm) ? startFilm : stopFilm)(fm);
}
function stopAll() { for (const fm of films) stopFilm(fm); }

// ---------------------------------------------------------------- loop
let active = true, progress = 0, shift = 0, speed = 0.32, lastY = scrollY, scrollBoost = 0, chooseT = 0, last = performance.now();
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
function readScroll() {
  const r = section.getBoundingClientRect(), span = r.height - innerHeight;
  progress = Math.min(1, Math.max(0, span > 0 ? -r.top / span : 0));
  const was = active; active = r.bottom > innerHeight * 0.3 && r.top < innerHeight; if (was && !active) stopAll();
  stage.style.setProperty('--p', progress.toFixed(4));
  scrollBoost += Math.min(3, Math.abs(scrollY - lastY) * 0.004); lastY = scrollY;
}
addEventListener('scroll', readScroll, { passive: true }); readScroll();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const lbOpen = !lb.hidden;
  if (!active || document.hidden || lbOpen) { if (lbOpen) stopAll(); return; }
  const target = REDUCED ? 0.06 : hovered ? 0.05 : 0.32;
  speed += (target - speed) * Math.min(1, dt * 3);
  scrollBoost *= Math.pow(0.04, dt);
  shift = (shift + (speed + scrollBoost) * dt) % L;
  placeFrames(shift);
  reel.userData.spin.rotation.z -= (speed + scrollBoost) * dt * 0.35;
  dust.rotation.y += dt * 0.012; dust.position.y = Math.sin(now * 0.00012) * 0.25;

  rig(progress, camPos, camAt);
  camPos.multiplyScalar(distK);
  mouseS.lerp(pointerIn && !MOBILE ? mouse : mouse.set(0, 0), Math.min(1, dt * 2.5));
  camera.position.set(camPos.x + mouseS.x * 0.9, camPos.y - mouseS.y * 0.5, camPos.z);
  camera.lookAt(camAt);

  if ((chooseT -= dt) <= 0) { chooseT = 0.35; if (!REDUCED) chooseVideos(); }
  composer ? composer.render() : renderer.render(scene, camera);
}
document.documentElement.classList.add('gl-on');
if (MOBILE) { section.querySelector('.cue2').textContent = 'Tap a frame to watch'; section.querySelector('.cue span').textContent = 'Swipe up to fly in'; }
requestAnimationFrame(frame);

window.__hero3d = {
  get active() { return active; }, get progress() { return progress; }, MOBILE, N, L,
  playing: () => films.filter((fm) => fm.playing).map((fm) => fm.f.id),
  shown: () => films.filter((fm) => fm.mat.map === fm.vtex).map((fm) => fm.f.id),
  // debug: screen-space boxes of every frame (px), for layout checks
  rects: () => frames.map((fr) => {
    const b = new THREE.Box3().setFromObject(fr.g.children[0]); const r = canvas.getBoundingClientRect();
    const c = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(camera); if (v.z < 1) c.push([(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]);
    }
    if (!c.length) return null;
    const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
    return [Math.round(Math.min(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...xs)), Math.round(Math.max(...ys))];
  }),
  get KEYS() { return KEYS; }, reel, loop, camera,
};
