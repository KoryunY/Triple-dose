// One WebGL renderer for the whole game. Scenes plug in via setView({ scene, camera, update, resize }).
// Tuned for mid/low-end phones: capped pixel ratio, no shadows, adaptive resolution.

import * as THREE from 'three';

let renderer, current = null, last = 0, running = false;
let pixelRatio = 1;
let frameTimes = [];
const quality = { level: 'auto' };

export function initStage(container) {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
  pixelRatio = Math.min(window.devicePixelRatio || 1, lowEnd() ? 1 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x07060c, 1);
  container.appendChild(renderer.domElement);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now(); });
  running = true;
  requestAnimationFrame(loop);
  return renderer;
}

function lowEnd() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return mem <= 2 || cores <= 4;
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  current?.resize?.(window.innerWidth, window.innerHeight);
}

export function setView(view) {
  if (current?.leave) current.leave();
  current = view;
  if (current?.resize) current.resize(window.innerWidth, window.innerHeight);
}

export function getRenderer() { return renderer; }

function loop(t) {
  if (!running) return;
  requestAnimationFrame(loop);
  if (document.hidden) return;
  const dt = Math.min(0.1, (t - (last || t)) / 1000);
  last = t;
  if (!current) return;
  current.update?.(dt, t / 1000);
  renderer.render(current.scene, current.camera);
  adapt(dt);
}

// Drop resolution if frames are slow; raise it back if there's headroom.
function adapt(dt) {
  frameTimes.push(dt);
  if (frameTimes.length < 90) return;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  frameTimes = [];
  const max = Math.min(window.devicePixelRatio || 1, 1.5);
  if (avg > 1 / 40 && pixelRatio > 0.6) pixelRatio = Math.max(0.6, pixelRatio - 0.2);
  else if (avg < 1 / 57 && pixelRatio < max) pixelRatio = Math.min(max, pixelRatio + 0.1);
  else return;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Shared toon gradient so every material uses the same look.
let toonGrad = null;
export function toonGradient() {
  if (toonGrad) return toonGrad;
  const data = new Uint8Array([140, 205, 255]);
  toonGrad = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  toonGrad.minFilter = toonGrad.magFilter = THREE.NearestFilter;
  toonGrad.needsUpdate = true;
  return toonGrad;
}

const matCache = new Map();
export function toonMat(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.transparent ? 1 : 0}`;
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonGradient(),
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  if (!opts.unique) matCache.set(key, m);
  return m;
}

/** Make a texture from an SVG string (async). */
export function svgTexture(svg, w = 256, h = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return tex;
}
