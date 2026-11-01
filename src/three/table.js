// The lounge table: three seats, patrons behind each seat, dice per player, summons in the middle.

import * as THREE from 'three';
import { toonMat, svgTexture } from './stage.js';
import { createFighter } from './fighter.js';
import { SEAT_COLORS } from './arena.js';
import { portraitSVG } from '../art/portrait.js';
import { diceFaceIcon } from '../art/icons.js';

const FACE_IDS = ['ash', 'pipe', 'herb', 'water', 'fizz', 'shine'];
const TABLE_R = 3.2;

export function createTableView() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0710');
  scene.fog = new THREE.Fog('#0a0710', 12, 26);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);

  scene.add(new THREE.HemisphereLight('#ffd9b0', '#1a0f24', 0.9));
  const lamp = new THREE.PointLight('#ffcf8a', 30, 14, 1.6);
  lamp.position.set(0, 6, 0);
  scene.add(lamp);
  const rim = new THREE.DirectionalLight('#b48cff', 0.6);
  rim.position.set(-5, 4, -6);
  scene.add(rim);

  // table
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.2, 48), toonMat('#1f5a45'));
  felt.position.y = 1;
  scene.add(felt);
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R, 0.16, 8, 48), toonMat('#5a3524'));
  rimMesh.rotation.x = Math.PI / 2; rimMesh.position.y = 1.1;
  scene.add(rimMesh);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 1, 12), toonMat('#2b1a14'));
  leg.position.y = 0.45;
  scene.add(leg);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 32), toonMat('#1a1222'));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // center emblem
  const emblem = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.78, 3), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.5 }));
  emblem.rotation.x = -Math.PI / 2; emblem.position.y = 1.11;
  scene.add(emblem);
  // dice face textures
  const faceTex = {};
  for (const id of FACE_IDS) faceTex[id] = svgTexture(diceSvg(id), 128, 128);
  const faceMat = {};
  for (const id of FACE_IDS) faceMat[id] = new THREE.MeshBasicMaterial({ map: faceTex[id] });
  const diceGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);

  const seats = new Map(); // playerId -> seat objects
  let me = null;
  let summons = [];
  let t0 = 0;

  function seatAngle(relSeat) { return Math.PI / 2 + relSeat * (Math.PI * 2 / 3); }

  function setPlayers(players, myId) {
    me = myId;
    const mySeat = players.find((p) => p.id === myId)?.seat ?? 0;
    const ids = new Set(players.map((p) => p.id));
    for (const [id, s] of seats) if (!ids.has(id)) { s.group.removeFromParent(); seats.delete(id); }
    for (const p of players) {
      const rel = ((p.seat - mySeat) % 3 + 3) % 3;
      let s = seats.get(p.id);
      if (!s || s.patronId !== p.patron?.id || s.rel !== rel) {
        if (s) s.group.removeFromParent();
        s = makeSeat(p, rel);
        seats.set(p.id, s);
        scene.add(s.group);
      }
    }
  }

  function makeSeat(p, rel) {
    const a = seatAngle(rel);
    const group = new THREE.Group();
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const color = SEAT_COLORS[p.seat % 3];
    // chair
    const chair = new THREE.Group();
    chair.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 1), toonMat('#3a2030')));
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.15), toonMat('#4a2840'));
    back.position.set(0, 0.7, 0.45);
    chair.add(back);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.17), new THREE.MeshBasicMaterial({ color }));
    trim.position.set(0, 1.38, 0.45);
    chair.add(trim);
    chair.position.copy(dir.clone().multiplyScalar(TABLE_R + 0.9)).setY(0.75);
    chair.lookAt(0, 0.75, 0);
    group.add(chair);
    // patron portrait (billboard) — the player's girl sits here
    let sprite = null;
    if (rel !== 0) {
      const tex = svgTexture(portraitSVG(p.patron?.id || 'nao', { variant: 'bust', bg: false }), 320, 384);
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.scale.set(2.1, 2.52, 1);
      sprite.position.copy(dir.clone().multiplyScalar(TABLE_R + 1.1)).setY(2.35);
      group.add(sprite);
    }
    // seat glow on the table edge
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.copy(dir.clone().multiplyScalar(TABLE_R - 0.7)).setY(1.115);
    group.add(glow);
    // dice
    const dice = [0, 1].map((i) => {
      const m = new THREE.Mesh(diceGeo, FACE_IDS.map((f) => faceMat[f]));
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(i ? 0.32 : -0.32);
      m.userData.home = dir.clone().multiplyScalar(TABLE_R - 1.25).add(side).setY(1.32);
      m.position.copy(m.userData.home);
      group.add(m);
      return { mesh: m, anim: null, face: null };
    });
    return { group, dir, rel, patronId: p.patron?.id, sprite, dice, glow, key: null };
  }

  // Put `face` on top (+Y): BoxGeometry material order is +x,-x,+y,-y,+z,-z.
  function setTop(d, face) {
    const others = FACE_IDS.filter((f) => f !== face);
    d.mesh.material = [faceMat[others[0]], faceMat[others[1]], faceMat[face], faceMat[others[2]], faceMat[others[3]], faceMat[others[4]]];
  }

  /** Show a player's roll. key changes per round so we only animate once. */
  function setDice(playerId, dose, key, animate = true) {
    const s = seats.get(playerId);
    if (!s || !dose) return;
    if (s.key === key) return;
    s.key = key;
    [dose.smoke, dose.drink].forEach((face, i) => {
      const d = s.dice[i];
      setTop(d, face);
      d.face = face;
      if (animate) {
        d.anim = { t: 0, dur: 1.1 + i * 0.25, spin: new THREE.Vector3(6 + Math.random() * 6, 4 + Math.random() * 4, 5 + Math.random() * 6), yaw: Math.random() * Math.PI * 2 };
      } else {
        d.mesh.rotation.set(0, Math.random() * 6, 0);
        d.mesh.position.copy(d.mesh.userData.home);
      }
    });
  }

  function hideDice(hidden) {
    for (const s of seats.values()) for (const d of s.dice) d.mesh.visible = !hidden;
  }

  /** Summon fighters rising from the table, one per player, in front of their seat. */
  function summon(players) {
    clearSummons();
    for (const p of players) {
      const s = seats.get(p.id);
      if (!s || !p.fighter) continue;
      const f = createFighter(p.fighter.parts, { scale: 0.62 });
      const pos = s.dir.clone().multiplyScalar(TABLE_R - 1.55);
      f.group.position.set(pos.x, 1.1, pos.z);
      f.group.lookAt(0, 1.1, 0);
      f.group.rotateY(Math.PI);
      const target = f.group.scale.x;
      f.group.scale.setScalar(0.001);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 4, 16, 1, true), new THREE.MeshBasicMaterial({ color: SEAT_COLORS[p.seat % 3], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(pos.x, 3, pos.z);
      scene.add(f.group, beam);
      summons.push({ f, beam, t: 0, target });
    }
  }
  function clearSummons() {
    for (const s of summons) { s.f.dispose(); s.beam.removeFromParent(); s.beam.material.dispose(); }
    summons = [];
  }

  function seatScreen(playerId, w, h) {
    const s = seats.get(playerId);
    if (!s) return null;
    const v = s.dir.clone().multiplyScalar(TABLE_R + (s.rel === 0 ? 0.4 : 1.1)).setY(s.rel === 0 ? 1.2 : 3.75);
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, rel: s.rel };
  }

  function update(dt, t) {
    t0 = t;
    for (const s of seats.values()) {
      if (s.sprite) s.sprite.position.y = 2.35 + Math.sin(t * 1.3 + s.rel) * 0.04;
      for (const d of s.dice) {
        if (!d.anim) continue;
        d.anim.t += dt;
        const k = Math.min(1, d.anim.t / d.anim.dur);
        const e = 1 - Math.pow(1 - k, 3);
        const home = d.mesh.userData.home;
        d.mesh.position.set(home.x, home.y + Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * 0.9, home.z);
        d.mesh.rotation.set(d.anim.spin.x * (1 - e), d.anim.yaw + d.anim.spin.y * (1 - e), d.anim.spin.z * (1 - e));
        if (k >= 1) { d.mesh.rotation.set(0, d.anim.yaw, 0); d.mesh.position.copy(home); d.anim = null; }
      }
    }
    for (const s of summons) {
      s.t += dt;
      const k = Math.min(1, s.t / 0.7);
      s.f.group.scale.setScalar(Math.max(0.001, s.target * (1 - Math.pow(1 - k, 3))));
      s.beam.material.opacity = Math.max(0, 0.45 * (1 - s.t / 1.6));
      s.f.update(dt, false, t);
    }
    emblem.rotation.z += dt * 0.3;
  }

  function resize(w, h) {
    camera.aspect = w / h;
    const tall = w < h;
    const k = tall ? Math.min(2.3, Math.pow(h / w, 1.08)) : 1;
    camera.fov = tall ? 52 : 46;
    camera.position.set(0, 6.4 * k, 6.2 * k + 1.5);
    camera.lookAt(0, 0.9, tall ? -0.6 : -0.2);
    camera.updateProjectionMatrix();
  }

  return { scene, camera, update, resize, setPlayers, setDice, hideDice, summon, clearSummons, seatScreen };
}

function diceSvg(id) {
  const icon = diceFaceIcon(id);
  const rare = id === 'herb' || id === 'shine';
  const smoke = ['ash', 'pipe', 'herb'].includes(id);
  const bg = smoke ? '#2a2236' : '#1b2a3a';
  const inner = icon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="${rare ? '#3a2a10' : bg}"/><rect x="3" y="3" width="58" height="58" rx="8" fill="none" stroke="${rare ? '#ffd166' : '#ffffff33'}" stroke-width="${rare ? 3 : 1.5}"/><g transform="translate(8 8) scale(0.75)">${inner}</g></svg>`;
}
