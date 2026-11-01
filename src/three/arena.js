// Arena: replays a deterministic battle in sync with the match clock.

import * as THREE from 'three';
import { createBattle, stepBattle, DT, ARENA_R, overtimeMult } from '../../shared/sim.js';
import { createFighter } from './fighter.js';
import { toonMat } from './stage.js';

export const SEAT_COLORS = ['#ff5a8a', '#4fd1ff', '#ffd166'];

export function createArenaView({ overlay, onEvent } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0814');
  scene.fog = new THREE.Fog('#0b0814', 26, 46);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight('#bfc8ff', '#2a1430', 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', 1.3);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  // floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 1.2, 40), toonMat('#2a2140'));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const inner = new THREE.Mesh(new THREE.RingGeometry(ARENA_R * 0.45, ARENA_R * 0.47, 48), new THREE.MeshBasicMaterial({ color: '#4b3a78' }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.01;
  scene.add(inner);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 1.2, 0.12, 6, 64), new THREE.MeshBasicMaterial({ color: '#c77dff' }));
  edge.rotation.x = Math.PI / 2; edge.position.y = 0.1;
  scene.add(edge);
  // pillars with neon caps
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3, 6), toonMat('#1c1630'));
    pil.position.set(Math.cos(a) * (ARENA_R + 3), 1.5, Math.sin(a) * (ARENA_R + 3));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff5a8a' : '#4fd1ff' }));
    cap.position.y = 1.7;
    pil.add(cap);
    scene.add(pil);
  }

  // effects pools
  const fxGroup = new THREE.Group();
  scene.add(fxGroup);
  const bursts = [];
  const projectiles = [];

  let battle = null, actors = new Map(), clockStart = 0, nowFn = () => Date.now(), lastTick = 0;
  let zoom = 1;
  let shake = 0, finished = false, onFinish = null, ownerColor = {}, overtimeShown = false;
  const camTarget = new THREE.Vector3();

  // ------------------------------------------------ overlay (hp bars, names, numbers)
  const layer = document.createElement('div');
  layer.className = 'arena-layer';
  overlay?.appendChild(layer);

  function makeBar(unit, color, isMe) {
    const el = document.createElement('div');
    el.className = `unit-tag${isMe ? ' me' : ''}${unit.kind !== 'main' ? ' small' : ''}`;
    el.innerHTML = `<div class="ut-name" style="color:${color}">${escapeHtml(unit.name)}</div><div class="ut-bar"><i style="background:${color}"></i></div>`;
    layer.appendChild(el);
    return { el, fill: el.querySelector('i') };
  }

  function floatText(pos, text, cls) {
    const el = document.createElement('div');
    el.className = `float ${cls || ''}`;
    el.textContent = text;
    layer.appendChild(el);
    const v = pos.clone();
    v.y += 2.1;
    const p = project(v);
    el.style.transform = `translate(${p.x + (Math.random() - 0.5) * 36}px, ${p.y + (Math.random() - 0.5) * 14}px)`;
    setTimeout(() => el.remove(), 900);
    // keep the overlay light on slow phones
    const all = layer.querySelectorAll('.float');
    if (all.length > 14) all[0].remove();
  }

  const tmp = new THREE.Vector3();
  function project(v) {
    tmp.copy(v).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * window.innerWidth, y: (-tmp.y * 0.5 + 0.5) * window.innerHeight, behind: tmp.z > 1 };
  }

  // ------------------------------------------------ battle setup
  function start(data, { startAt, now, me, owners, onDone }) {
    clear();
    battle = createBattle(data.units, data.seed, { maxSeconds: data.maxSeconds || 45 });
    clockStart = startAt;
    zoom = 1;
    nowFn = now || nowFn;
    onFinish = onDone;
    finished = false;
    overtimeShown = false;
    lastTick = 0;
    ownerColor = {};
    (owners || []).forEach((o) => { ownerColor[o.id] = SEAT_COLORS[o.seat % 3]; });
    for (const u of battle.units) {
      const f = createFighter(u.parts, { scale: (u.kind === 'echo' ? 0.85 : u.kind === 'clone' ? 0.65 : 1) * 1.2 });
      const color = ownerColor[u.owner] || '#ffffff';
      const disc = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02;
      f.group.add(disc);
      f.group.position.set(u.x, 0, u.y);
      f.group.rotation.y = Math.atan2(u.fx, u.fy);
      scene.add(f.group);
      actors.set(u.uid, {
        u, f, disc,
        prev: new THREE.Vector2(u.x, u.y), cur: new THREE.Vector2(u.x, u.y),
        bar: makeBar(u, color, u.owner === me),
        alive: true, moving: false,
      });
    }
  }

  function clear() {
    for (const a of actors.values()) { a.f.dispose(); a.disc.geometry.dispose(); a.bar.el.remove(); }
    actors.clear();
    for (const b of bursts) b.mesh.removeFromParent();
    bursts.length = 0;
    for (const p of projectiles) p.mesh.removeFromParent();
    projectiles.length = 0;
    layer.querySelectorAll('.float').forEach((e) => e.remove());
    battle = null;
  }

  // ------------------------------------------------ fx
  const burstGeo = new THREE.SphereGeometry(0.25, 8, 6);
  function burst(pos, color, size = 1) {
    const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos); m.position.y += 1.1;
    fxGroup.add(m);
    bursts.push({ mesh: m, t: 0, size });
  }
  const projGeo = { staff: new THREE.SphereGeometry(0.16, 8, 6), bow: new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4) };
  function shoot(a, b, ticks) {
    const kind = a.u.weapon === 'bow' ? 'bow' : 'staff';
    const mat = new THREE.MeshBasicMaterial({ color: kind === 'bow' ? '#f3e9c6' : '#ff9f1c', blending: kind === 'bow' ? THREE.NormalBlending : THREE.AdditiveBlending, transparent: true });
    const mesh = new THREE.Mesh(projGeo[kind], mat);
    if (kind === 'bow') mesh.rotation.x = Math.PI / 2;
    fxGroup.add(mesh);
    projectiles.push({ mesh, from: a, to: b, t: 0, dur: ticks * DT, kind });
  }

  // ------------------------------------------------ event handling
  function handle(e, live) {
    const A = e.a ? actors.get(e.a) : null;
    const B = e.b ? actors.get(e.b) : e.u ? actors.get(e.u) : null;
    if (e.t === 'swing' && A) { A.f.attack(); }
    if (e.t === 'proj' && A && B) { A.f.attack(); if (live) shoot(A, B, e.ticks); }
    if (e.t === 'hit' && B) {
      B.f.hit(e.crit);
      if (live) {
        burst(B.f.group.position, e.crit ? '#ffd166' : '#ffffff', e.crit ? 1.6 : 1);
        floatText(B.f.group.position, e.crit ? `${e.dmg}!` : `${e.dmg}`, e.crit ? 'crit' : '');
        if (e.crit) shake = 0.25;
      }
    }
    if ((e.t === 'dodge' || e.t === 'miss') && B && live) floatText(B.f.group.position, e.t === 'dodge' ? 'DODGE' : 'MISS', 'miss');
    if (e.t === 'death' && B) { B.f.die(); B.alive = false; B.bar.el.classList.add('dead'); if (live) { burst(B.f.group.position, '#ff3355', 2.2); shake = 0.35; } }
    if (e.t === 'revive' && B) { B.f.revive(); B.alive = true; B.bar.el.classList.remove('dead'); if (live) { burst(B.f.group.position, '#ffb347', 2.4); floatText(B.f.group.position, 'REVIVE', 'heal'); } }
    if (e.t === 'steal' && B && live) floatText(B.f.group.position, 'STOLEN', 'miss');
    if (e.t === 'end') { finished = true; }
    if (live) onEvent?.(e, { A, B });
  }

  // ------------------------------------------------ update
  function update(dt, t) {
    if (battle) {
      const elapsed = Math.max(0, (nowFn() - clockStart) / 1000);
      const target = Math.floor(elapsed / DT);
      const behind = target - battle.tick;
      let steps = 0;
      while (!battle.done && battle.tick < target && steps < 400) {
        for (const a of actors.values()) a.prev.copy(a.cur);
        const live = behind < 8; // fast-forwarding a late join: skip the fireworks
        const events = stepBattle(battle);
        for (const e of events) handle(e, live);
        for (const a of actors.values()) a.cur.set(a.u.x, a.u.y);
        steps++;
      }
      if (battle.done && finished && onFinish) { const f = onFinish; onFinish = null; setTimeout(() => f(battle.winner), 900); }
      if (!overtimeShown && overtimeMult(battle) > 1) { overtimeShown = true; onEvent?.({ t: 'overtime' }, {}); }

      const frac = Math.min(1, (elapsed - battle.tick * DT) / DT + 1);
      let cx = 0, cz = 0, n = 0;
      const pts = [];
      for (const a of actors.values()) {
        const x = a.prev.x + (a.cur.x - a.prev.x) * frac;
        const z = a.prev.y + (a.cur.y - a.prev.y) * frac;
        const moved = Math.abs(a.cur.x - a.prev.x) + Math.abs(a.cur.y - a.prev.y);
        a.f.group.position.set(x, 0, z);
        const yaw = Math.atan2(a.u.fx, a.u.fy);
        a.f.group.rotation.y += angleDelta(a.f.group.rotation.y, yaw) * Math.min(1, dt * 12);
        a.f.update(dt, moved > 0.001 && a.alive, t);
        if (a.alive) { cx += x; cz += z; n++; pts.push([x, z]); }
        // hp bar
        const p = project(a.f.group.position.clone().setY(a.f.height + 0.15));
        a.bar.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        a.bar.fill.style.width = `${Math.max(0, (a.u.hp / a.u.maxHp) * 100)}%`;
        a.bar.el.style.display = p.behind || !a.f.group.visible ? 'none' : '';
      }
      if (n) {
        const mx = cx / n, mz = cz / n;
        let spread = 0;
        for (const [px, pz] of pts) spread = Math.max(spread, Math.hypot(px - mx, pz - mz));
        camTarget.lerp(new THREE.Vector3(mx * 0.7, 0, mz * 0.7), Math.min(1, dt * 1.5));
        // zoom to fit the fight: close when they brawl, wider when spread out
        const want = Math.max(0.42, Math.min(1, (spread + 4.5) / 13));
        zoom += (want - zoom) * Math.min(1, dt * 1.2);
      }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const k = b.t / 0.35;
      b.mesh.scale.setScalar(0.4 + k * 2 * b.size);
      b.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { b.mesh.removeFromParent(); b.mesh.material.dispose(); bursts.splice(i, 1); }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const a = p.from.f.group.position, b = p.to.f.group.position;
      p.mesh.position.set(a.x + (b.x - a.x) * k, 1.2 + Math.sin(k * Math.PI) * (p.kind === 'bow' ? 0.8 : 0.3), a.z + (b.z - a.z) * k);
      if (p.kind === 'bow') p.mesh.lookAt(b.x, 1.2, b.z), p.mesh.rotateX(Math.PI / 2);
      if (k >= 1) { p.mesh.removeFromParent(); p.mesh.material.dispose(); projectiles.splice(i, 1); }
    }

    // camera
    shake = Math.max(0, shake - dt);
    const s = shake * 0.6;
    camera.position.set(camTarget.x + baseCam.x * zoom + (Math.random() - 0.5) * s, baseCam.y * zoom + (Math.random() - 0.5) * s, camTarget.z + baseCam.z * zoom);
    camera.lookAt(camTarget.x, 0.6, camTarget.z);
    edge.material.color.setHSL((t * 0.05) % 1, 0.7, 0.6);
  }

  const baseCam = new THREE.Vector3(0, 17, 15);
  function resize(w, h) {
    camera.aspect = w / h;
    // keep the whole arena in view on tall phone screens
    const k = w < h ? Math.pow(h / w, 0.6) : 1;
    baseCam.set(0, 15 * k, 13 * k);
    camera.updateProjectionMatrix();
  }

  return {
    scene, camera, update, resize, start, clear,
    leave() { layer.style.display = 'none'; },
    enter() { layer.style.display = ''; },
    get battle() { return battle; },
    destroy() { clear(); layer.remove(); },
  };
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
