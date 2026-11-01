// Procedural low-poly fighter built from "parts". Every part reads as a buff:
// head = CRIT, body bulk = HP/ARMOR, legs = SPD, arms = ATK SPD, weapon = suit, aura = dice dose.

import * as THREE from 'three';
import { toonMat } from './stage.js';

const geo = {
  capsule: (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8),
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
  sphere: (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h),
  cyl: (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 8) => new THREE.ConeGeometry(r, h, s),
  torus: (r, t, rs = 6, ts = 14, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
};
// Cache geometries by key — fighters share them.
const gcache = new Map();
function G(key, make) { if (!gcache.has(key)) gcache.set(key, make()); return gcache.get(key); }

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

export function createFighter(parts, opts = {}) {
  const p = parts || {};
  const group = new THREE.Group();
  const body = new THREE.Group();     // everything that tips over on death
  group.add(body);
  const flashMats = [];
  const uniq = (color, o = {}) => { const m = toonMat(color, { ...o, unique: true }); flashMats.push(m); return m; };

  const primary = p.primary || '#ff5a6e';
  const secondary = p.secondary || '#3fa7ff';
  const skin = p.skin || '#f2c9a8';
  const bulk = p.bulk || 1;
  const metal = '#c9ced8';

  // ---- legs (SPD)
  const legR = p.legs === 'runner' ? 0.085 : p.legs === 'heavy' ? 0.14 : 0.11;
  const legL = p.legs === 'runner' ? 0.5 : 0.42;
  const legMat = uniq(shade(secondary, 0.7));
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.12 * side * bulk, 0.78, 0);
    const leg = mesh(G(`leg${legR}${legL}`, () => geo.capsule(legR, legL)), legMat, 0, -0.36, 0);
    const foot = mesh(G('foot', () => geo.box(0.16, 0.08, 0.26)), toonMat('#1b1b24'), 0, -0.72, 0.04);
    pivot.add(leg, foot);
    if (p.legs === 'runner') pivot.add(mesh(G('stripe', () => geo.box(0.19, 0.04, 0.19)), toonMat('#ffffff'), 0, -0.5, 0));
    body.add(pivot);
    legs.push(pivot);
  }

  // ---- torso (HP / ARMOR)
  const torsoMat = uniq(primary, { emissive: p.glow || null, emissiveIntensity: p.glow ? 0.25 : 0 });
  const torso = new THREE.Group();
  torso.position.y = 1.08;
  torso.scale.set(bulk, 1, bulk);
  if (p.body === 'robe') {
    torso.add(mesh(G('robe', () => geo.cyl(0.22, 0.38, 0.8, 10)), torsoMat, 0, -0.1, 0));
    torso.add(mesh(G('sash', () => geo.cyl(0.235, 0.25, 0.08, 10)), toonMat(secondary), 0, 0.02, 0));
  } else if (p.body === 'plate') {
    torso.add(mesh(G('plate', () => geo.box(0.56, 0.56, 0.36)), uniq(metal), 0, 0, 0));
    torso.add(mesh(G('trim', () => geo.box(0.58, 0.1, 0.38)), torsoMat, 0, -0.22, 0));
    for (const s of [-1, 1]) torso.add(mesh(G('pad', () => geo.sphere(0.15, 8, 6)), torsoMat, 0.32 * s, 0.24, 0));
  } else if (p.body === 'coat') {
    torso.add(mesh(G('coat', () => geo.cyl(0.26, 0.31, 0.78, 10)), torsoMat, 0, -0.05, 0));
    torso.add(mesh(G('collar', () => geo.torus(0.2, 0.06, 5, 10)), toonMat(secondary), 0, 0.3, 0).rotateX(Math.PI / 2));
  } else {
    torso.add(mesh(G('vest', () => geo.box(0.48, 0.56, 0.3)), torsoMat, 0, 0, 0));
    torso.add(mesh(G('vstripe', () => geo.box(0.12, 0.57, 0.31)), toonMat(secondary), 0, 0, 0.001));
  }
  body.add(torso);

  // ---- arms (ATK SPD) + weapon (suit)
  const armR = p.arms === 'quick' ? 0.07 : 0.09;
  const armMat = uniq(shade(primary, 0.85));
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.34 * side * bulk, 1.32, 0);
    pivot.add(mesh(G(`arm${armR}`, () => geo.capsule(armR, 0.38)), armMat, 0, -0.26, 0));
    pivot.add(mesh(G('hand', () => geo.sphere(0.075, 8, 6)), toonMat(skin), 0, -0.52, 0));
    body.add(pivot);
    arms.push(pivot);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.54, 0.02);
  arms[1].add(hand);
  const offHand = new THREE.Group();
  offHand.position.set(0, -0.54, 0.02);
  arms[0].add(offHand);
  buildWeapon(p.weapon, hand, offHand, primary, secondary);

  // ---- head (CRIT)
  const head = new THREE.Group();
  head.position.y = 1.62;
  head.add(mesh(G('head', () => geo.sphere(0.22, 14, 12)), uniq(skin), 0, 0, 0));
  const eyeMat = toonMat(p.eye || '#ffffff', { emissive: p.eye || '#ffffff', emissiveIntensity: p.eye === '#ff3355' ? 1 : 0.2 });
  for (const s of [-1, 1]) head.add(mesh(G('eye', () => geo.box(0.05, 0.07, 0.02)), eyeMat, 0.08 * s, 0.02, 0.205));
  buildHead(p.head, head, primary, secondary);
  body.add(head);

  // ---- aura (dose)
  let aura = null, sparkles = null;
  if (p.aura) {
    const ringMat = new THREE.MeshBasicMaterial({ color: p.aura.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    aura = mesh(G('aura', () => new THREE.RingGeometry(0.45, 0.62, 24)), ringMat, 0, 0.03, 0);
    aura.rotation.x = -Math.PI / 2;
    group.add(aura);
    if (p.aura.type === 'double' || p.aura.type === 'haze' || p.aura.type === 'shine') {
      const n = p.aura.type === 'double' ? 18 : 10;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 0.9; pos[i * 3 + 1] = Math.random() * 1.8; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.9; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sparkles = new THREE.Points(g, new THREE.PointsMaterial({ color: p.aura.color, size: 0.09, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(sparkles);
    }
  }

  const h = (p.height || 1) * (opts.scale || 1);
  group.scale.setScalar(h);

  // ---- animation state
  const st = { walk: 0, attackT: 0, flash: 0, dead: false, deathT: 0, bob: Math.random() * 6 };

  return {
    group,
    head,
    height: 1.95 * h,
    attack() { st.attackT = 0.28; },
    hit(crit) { st.flash = crit ? 0.22 : 0.12; },
    die() { st.dead = true; st.deathT = 0; },
    revive() { st.dead = false; body.rotation.x = 0; body.position.y = 0; group.visible = true; },
    update(dt, moving, t) {
      st.bob += dt * (moving ? 10 : 2.5);
      if (!st.dead) {
        const sw = moving ? Math.sin(st.bob) * 0.7 : 0;
        legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
        arms[0].rotation.x = -sw * 0.6;
        body.position.y = moving ? Math.abs(Math.sin(st.bob)) * 0.05 : Math.sin(st.bob) * 0.015;
        if (st.attackT > 0) {
          st.attackT = Math.max(0, st.attackT - dt);
          const k = 1 - st.attackT / 0.28;
          arms[1].rotation.x = -Math.sin(k * Math.PI) * 2.0;
        } else arms[1].rotation.x = sw * 0.6;
      } else if (st.deathT < 1) {
        st.deathT += dt * 1.6;
        const k = Math.min(1, st.deathT);
        body.rotation.x = -k * 1.45;
        body.position.y = -k * 0.15;
        if (k >= 1) group.visible = false;
      }
      if (st.flash > 0) {
        st.flash -= dt;
        const on = st.flash > 0;
        for (const m of flashMats) m.emissive.setRGB(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0);
        if (!on && p.glow) torsoMat.emissive.set(p.glow);
      }
      if (aura) { aura.rotation.z += dt * 1.2; aura.material.opacity = 0.4 + Math.sin(t * 4) * 0.15; }
      if (sparkles) { sparkles.rotation.y += dt * 0.8; }
    },
    dispose() {
      for (const m of flashMats) m.dispose();
      group.removeFromParent();
    },
  };
}

function buildWeapon(weapon, hand, offHand, primary, secondary) {
  const steel = toonMat('#dfe6f0');
  const dark = toonMat('#3a2a22');
  if (weapon === 'sword') {
    const w = new THREE.Group();
    w.add(mesh(G('blade', () => geo.box(0.06, 0.75, 0.02)), steel, 0, -0.42, 0.0));
    w.add(mesh(G('guard', () => geo.box(0.22, 0.04, 0.06)), toonMat(primary), 0, -0.04, 0));
    w.rotation.x = Math.PI / 2; w.position.z = 0.05;
    hand.add(w);
  } else if (weapon === 'staff') {
    const w = new THREE.Group();
    w.add(mesh(G('staffpole', () => geo.cyl(0.03, 0.03, 1.1, 6)), dark, 0, 0, 0));
    w.add(mesh(G('orb', () => geo.sphere(0.1, 10, 8)), toonMat('#ffb347', { emissive: '#ff7a1c', emissiveIntensity: 0.9 }), 0, 0.6, 0));
    w.position.y = 0.2;
    hand.add(w);
  } else if (weapon === 'mace') {
    const w = new THREE.Group();
    w.add(mesh(G('macehandle', () => geo.cyl(0.03, 0.03, 0.5, 6)), dark, 0, -0.15, 0));
    w.add(mesh(G('macehead', () => new THREE.IcosahedronGeometry(0.13, 0)), steel, 0, -0.45, 0));
    w.rotation.x = Math.PI / 2;
    hand.add(w);
    const shield = mesh(G('shield', () => geo.cyl(0.26, 0.26, 0.05, 12)), toonMat(primary), 0.05, 0.1, 0.12);
    shield.rotation.z = Math.PI / 2;
    shield.add(mesh(G('boss', () => geo.sphere(0.07, 8, 6)), toonMat(secondary), 0, 0.03, 0));
    offHand.add(shield);
  } else if (weapon === 'daggers') {
    for (const h of [hand, offHand]) {
      const d = mesh(G('dagger', () => geo.box(0.04, 0.32, 0.015)), steel, 0, -0.18, 0.04);
      d.rotation.x = Math.PI / 2.5;
      h.add(d);
    }
  } else if (weapon === 'bow') {
    const bow = mesh(G('bow', () => geo.torus(0.42, 0.025, 4, 12, Math.PI)), toonMat('#8a5a33'), 0, 0, 0.05);
    bow.rotation.z = Math.PI / 2;
    offHand.add(bow);
  }
}

function buildHead(type, head, primary, secondary) {
  if (type === 'helm') {
    head.add(mesh(G('helm', () => new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), toonMat('#b7bcc8'), 0, 0.02, 0));
    head.add(mesh(G('crest', () => geo.box(0.04, 0.12, 0.3)), toonMat(primary), 0, 0.25, 0));
  } else if (type === 'hood') {
    const hood = mesh(G('hood', () => geo.cone(0.27, 0.42, 10)), toonMat(shade(primary, 0.6)), 0, 0.14, -0.03);
    head.add(hood);
  } else if (type === 'horns') {
    head.add(mesh(G('hair', () => new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2)), toonMat(secondary), 0, 0.01, -0.01));
    for (const s of [-1, 1]) {
      const h = mesh(G('horn', () => geo.cone(0.05, 0.25, 6)), toonMat('#2a2030'), 0.13 * s, 0.22, 0);
      h.rotation.z = -0.4 * s;
      head.add(h);
    }
  } else if (type === 'crown') {
    head.add(mesh(G('hair', () => new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2)), toonMat(secondary), 0, 0.01, -0.01));
    const gold = toonMat('#ffd166', { emissive: '#ff9f1c', emissiveIntensity: 0.25 });
    head.add(mesh(G('crownband', () => geo.cyl(0.17, 0.17, 0.07, 10)), gold, 0, 0.2, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      head.add(mesh(G('crownspike', () => geo.cone(0.035, 0.1, 5)), gold, Math.cos(a) * 0.16, 0.28, Math.sin(a) * 0.16));
    }
  } else if (type === 'mask') {
    head.add(mesh(G('hair', () => new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2)), toonMat('#15151c'), 0, 0.01, -0.01));
    head.add(mesh(G('mask', () => geo.box(0.34, 0.1, 0.06)), toonMat('#15151c'), 0, 0.02, 0.19));
  } else {
    head.add(mesh(G('hair', () => new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2)), toonMat(secondary), 0, 0.01, -0.01));
    head.add(mesh(G('fringe', () => geo.box(0.36, 0.08, 0.1)), toonMat(secondary), 0, 0.14, 0.15));
  }
}
