// Deterministic arena auto-battle.
// Only + - * / sqrt and a seeded RNG are used, so every device replays the exact same fight.

import { makeRng } from './rng.js';

export const DT = 0.05;              // 20 ticks per second
export const ARENA_R = 11;
const PROJ_SPEED = 14;
const RETARGET_TICKS = 10;
const OVERTIME_AT = 30;              // seconds; after this, damage ramps up and healing fades
const OVERTIME_RAMP = 0.18;          // +18% damage per second of overtime

// Spawn anchors (precomputed literals — no trig at runtime).
const ANCHORS = {
  1: [[0, 0]],
  2: [[0, 6.5], [0, -6.5]],
  3: [[0, 7], [-6.0621778264910704, -3.5], [6.0621778264910704, -3.5]],
  4: [[0, 7], [-7, 0], [7, 0], [0, -7]],
};
const OFFSETS = [[0, 0], [1.7, 0.9], [-1.7, 0.9], [0, 2], [1.7, -1.1], [-1.7, -1.1]];

/**
 * units: [{ uid, owner, name, kind, stats, range, projectile, specials, parts }]
 * owners order decides spawn side (first owner = slot 0).
 */
export function createBattle(units, seed, opts = {}) {
  const rng = makeRng(seed);
  const owners = [];
  for (const u of units) if (!owners.includes(u.owner)) owners.push(u.owner);
  const anchors = ANCHORS[Math.min(4, Math.max(1, owners.length))];

  const list = [];
  const perOwner = {};
  const addUnit = (u) => {
    const oi = owners.indexOf(u.owner);
    const k = perOwner[u.owner] = (perOwner[u.owner] || 0);
    perOwner[u.owner]++;
    const a = anchors[oi % anchors.length];
    const o = OFFSETS[k % OFFSETS.length];
    const toCenter = a[1] > 0 ? -1 : 1; // push extras toward the middle side
    const s = u.stats;
    list.push({
      uid: u.uid,
      owner: u.owner,
      name: u.name,
      kind: u.kind || 'main',
      parts: u.parts,
      weapon: u.weapon,
      range: u.range,
      projectile: !!u.projectile,
      specials: { ...(u.specials || {}) },
      maxHp: s.hp,
      hp: s.hp * (u.hpFrac == null ? 1 : Math.max(0.05, Math.min(1, u.hpFrac))),
      atk: s.atk,
      spd: s.spd,
      aspd: s.aspd,
      crit: s.crit,
      critDmg: s.critDmg,
      dodge: s.dodge,
      lifesteal: s.lifesteal,
      regen: s.regen,
      armor: s.armor,
      accuracy: s.accuracy,
      x: a[0] + o[0],
      y: a[1] + o[1] * toCenter,
      fx: -a[0], fy: -a[1],            // facing
      cd: 0.4 + rng.next() * 0.4,      // first swing delay
      target: null,
      alive: true,
      hits: 0,
      revived: false,
      dmgDone: 0,
    });
  };
  for (const u of units) {
    addUnit(u);
    if (u.specials && u.specials.clone) {
      const s = u.stats;
      addUnit({
        ...u,
        uid: `${u.uid}~clone`,
        name: `${u.name} (Twin)`,
        kind: 'clone',
        stats: { ...s, hp: s.hp * 0.35, atk: s.atk * 0.35 },
        specials: {},
      });
    }
  }

  return {
    tick: 0,
    units: list,
    owners,
    projectiles: [],
    done: false,
    winner: null,
    rng,
    maxTicks: Math.round((opts.maxSeconds || 45) / DT),
  };
}

function aliveOwners(b) {
  const set = [];
  for (const u of b.units) if (u.alive && !set.includes(u.owner)) set.push(u.owner);
  return set;
}

function nearestEnemy(b, u) {
  let best = null;
  let bestD = Infinity;
  for (const v of b.units) {
    if (!v.alive || v.owner === u.owner) continue;
    const dx = v.x - u.x, dy = v.y - u.y;
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && best && v.uid < best.uid)) { bestD = d; best = v; }
  }
  return best;
}

export function overtimeMult(b) {
  const over = b.tick * DT - OVERTIME_AT;
  return over > 0 ? 1 + over * OVERTIME_RAMP : 1;
}

function unitByUid(b, uid) {
  for (const u of b.units) if (u.uid === uid) return u;
  return null;
}

function dealHit(b, a, t, events, isProjectile) {
  if (!t.alive) return;
  const rng = b.rng;
  if (rng.next() > a.accuracy) { events.push({ t: 'miss', a: a.uid, b: t.uid }); return; }
  if (rng.next() < t.dodge) { events.push({ t: 'dodge', a: a.uid, b: t.uid }); return; }
  let crit = rng.next() < a.crit;
  if (a.hits === 0 && a.specials.firstCrit) crit = true;
  let dmg = a.atk * (crit ? a.critDmg : 1) * (1 - t.armor) * overtimeMult(b);
  dmg = Math.max(1, dmg);
  if (a.hits === 0 && a.specials.steal) {
    const stolen = t.atk * 0.1;
    t.atk -= stolen;
    a.atk += stolen;
    events.push({ t: 'steal', a: a.uid, b: t.uid });
  }
  a.hits++;
  t.hp -= dmg;
  a.dmgDone += dmg;
  if (a.lifesteal > 0 && a.alive) {
    const heal = dmg * a.lifesteal * (b.tick * DT > OVERTIME_AT ? 0.4 : 1);
    a.hp = Math.min(a.maxHp, a.hp + heal);
  }
  events.push({ t: 'hit', a: a.uid, b: t.uid, dmg: Math.round(dmg), crit, ranged: !!isProjectile });
  if (t.hp <= 0) {
    if (t.specials.revive && !t.revived) {
      t.revived = true;
      t.hp = t.maxHp * t.specials.revive;
      events.push({ t: 'revive', u: t.uid });
    } else {
      t.hp = 0;
      t.alive = false;
      events.push({ t: 'death', u: t.uid, by: a.uid });
    }
  }
}

/** Advance one tick; returns events for rendering. */
export function stepBattle(b) {
  if (b.done) return [];
  const events = [];
  b.tick++;
  const units = b.units;

  // Projectiles land
  for (let i = b.projectiles.length - 1; i >= 0; i--) {
    const p = b.projectiles[i];
    p.ticks--;
    if (p.ticks <= 0) {
      b.projectiles.splice(i, 1);
      const a = unitByUid(b, p.a);
      const t = unitByUid(b, p.b);
      if (a && t) dealHit(b, a, t, events, true);
    }
  }

  for (const u of units) {
    if (!u.alive) continue;

    // regen + heal aura
    const healMult = b.tick * DT > OVERTIME_AT ? 0.25 : 1;
    if (u.regen > 0) u.hp = Math.min(u.maxHp, u.hp + u.regen * DT * healMult);
    if (u.specials.healAura) {
      for (const v of units) {
        if (!v.alive || v === u || v.owner !== u.owner) continue;
        const dx = v.x - u.x, dy = v.y - u.y;
        if (dx * dx + dy * dy < 9) v.hp = Math.min(v.maxHp, v.hp + 4.5 * DT * healMult);
      }
    }

    // target (retarget periodically, or right away if the current target died)
    let t = u.target ? unitByUid(b, u.target) : null;
    if (!t || !t.alive || b.tick % RETARGET_TICKS === 0) {
      t = nearestEnemy(b, u);
      u.target = t ? t.uid : null;
    }
    if (!t) continue;

    const dx = t.x - u.x, dy = t.y - u.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    u.fx = dx / dist; u.fy = dy / dist;

    // move into range (ranged units keep a little distance)
    const want = u.range * 0.9;
    if (dist > want) {
      const step = Math.min(u.spd * DT, dist - want);
      u.x += u.fx * step;
      u.y += u.fy * step;
    } else if (u.range > 3 && dist < 2.2) {
      u.x -= u.fx * u.spd * DT * 0.6;
      u.y -= u.fy * u.spd * DT * 0.6;
    }

    // attack
    u.cd -= DT;
    if (u.cd <= 0 && dist <= u.range + 0.15) {
      u.cd = 1 / u.aspd;
      if (u.projectile) {
        const ticks = Math.max(1, Math.ceil(dist / PROJ_SPEED / DT));
        b.projectiles.push({ a: u.uid, b: t.uid, ticks });
        events.push({ t: 'proj', a: u.uid, b: t.uid, ticks });
      } else {
        events.push({ t: 'swing', a: u.uid, b: t.uid });
        dealHit(b, u, t, events, false);
      }
    }
  }

  // separation + arena bounds
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.alive) continue;
    for (let j = i + 1; j < units.length; j++) {
      const v = units[j];
      if (!v.alive) continue;
      const dx = v.x - u.x, dy = v.y - u.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 0.81 && d2 > 0) {
        const d = Math.sqrt(d2);
        const push = (0.9 - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        u.x -= nx * push; u.y -= ny * push;
        v.x += nx * push; v.y += ny * push;
      }
    }
    const r2 = u.x * u.x + u.y * u.y;
    if (r2 > ARENA_R * ARENA_R) {
      const r = Math.sqrt(r2);
      u.x = u.x / r * ARENA_R;
      u.y = u.y / r * ARENA_R;
    }
  }

  // end conditions
  const alive = aliveOwners(b);
  if (alive.length <= 1) {
    b.done = true;
    b.winner = alive[0] ?? null;
    events.push({ t: 'end', winner: b.winner });
  } else if (b.tick >= b.maxTicks) {
    // timeout: most remaining health fraction wins; ties -> earliest owner
    let best = null, bestScore = -1;
    for (const o of b.owners) {
      let s = 0;
      for (const u of units) if (u.owner === o && u.alive) s += u.hp / u.maxHp;
      if (s > bestScore) { bestScore = s; best = o; }
    }
    b.done = true;
    b.winner = best;
    events.push({ t: 'end', winner: best, timeout: true });
  }
  return events;
}

/** Run a whole battle (server / bots / tests). */
export function runBattle(units, seed, opts = {}) {
  const b = createBattle(units, seed, opts);
  while (!b.done) stepBattle(b);
  const survivors = b.units.filter((u) => u.alive).map((u) => ({ uid: u.uid, hpFrac: u.hp / u.maxHp }));
  const dmg = {};
  for (const u of b.units) dmg[u.uid] = Math.round(u.dmgDone);
  return { winner: b.winner, ticks: b.tick, seconds: b.tick * DT, survivors, dmg };
}
