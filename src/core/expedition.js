// Expedition: a solo roguelike run with your Echoes. 3 acts × 5 choices + a boss each.
// Rewards are granted as you go, so quitting never loses what you earned.

import { makeRng, randomSeed, hashSeed } from '../../shared/rng.js';
import { buildFighter, rollDose, echoBattleStats, applyMods, clampStats } from '../../shared/build.js';
import { SUIT_IDS, PERSONA_IDS } from '../../shared/data.js';
import { runBattle } from '../../shared/sim.js';

export const NODE_INFO = {
  fight: { name: 'Brawl', icon: '⚔', desc: 'A street fight. Win for Dust.' },
  elite: { name: 'Elite', icon: '☠', desc: 'A tough crew. Big rewards.' },
  dose: { name: 'Dose', icon: '🎲', desc: 'Roll the dice. The effect sticks for the whole run.' },
  rest: { name: 'Lounge', icon: '☕', desc: 'Heal your party 50%.' },
  treasure: { name: 'Stash', icon: '✦', desc: 'Free Dust or Tickets.' },
  boss: { name: 'Boss', icon: '♛', desc: 'Beat the boss to clear the act.' },
};
const BOSSES = ['The Bouncer', 'The Pit Boss', 'The House'];
const STEPS = 5;

export function newRun(party) {
  const seed = randomSeed();
  const rng = makeRng(seed);
  const acts = [0, 1, 2].map(() => {
    const steps = [];
    for (let i = 0; i < STEPS; i++) {
      const pool = i === 0 ? ['fight', 'fight', 'dose'] : i === STEPS - 1 ? ['rest', 'treasure', 'elite'] : ['fight', 'fight', 'elite', 'dose', 'rest', 'treasure'];
      const a = rng.pick(pool);
      let b = rng.pick(pool);
      if (b === a) b = rng.pick(pool.filter((x) => x !== a)) || a;
      steps.push([a, b]);
    }
    steps.push(['boss']);
    return steps;
  });
  return {
    seed, act: 0, step: 0, acts,
    party: party.map((e) => ({ id: e.id, hpFrac: 1 })),
    buffs: [],
    earned: { dust: 0, tickets: 0, fame: 0 },
    path: [],
    over: false, won: false,
  };
}

export function loanerEcho(seed = 1) {
  const rng = makeRng(seed);
  const suit = rng.pick(SUIT_IDS);
  const cards = [{ suit, rank: 5 }, { suit, rank: 5 }, { suit: rng.pick(SUIT_IDS), rank: 4 }];
  const f = buildFighter(cards, null, { seed, name: 'Rookie' });
  return { id: 'loaner', name: 'Rookie (loaner)', level: 0, stats: f.stats, weapon: f.weapon, weaponSuit: f.weaponSuit, range: f.range, projectile: f.projectile, specials: f.specials, parts: f.parts, power: f.power };
}

const ACT_POWER = [0.55, 1.0, 1.55];
const PARTY_SIZE_POWER = [0.8, 1.3, 1.75]; // bigger parties face tougher crews
const TYPE_POWER = { fight: 1, elite: 1.35, boss: 2.1 };

function enemyPower(run, type) {
  const size = Math.max(1, Math.min(3, run.party.length));
  return ACT_POWER[run.act] * (1 + run.step * 0.07) * (TYPE_POWER[type] || 1) * PARTY_SIZE_POWER[size - 1];
}

export function makeEnemies(run, type) {
  const rng = makeRng(hashSeed(`${run.seed}:${run.act}:${run.step}:${type}`));
  const pw = enemyPower(run, type);
  const count = type === 'boss' ? 1 : type === 'elite' ? 2 : 1 + (rng.chance(0.25 + run.act * 0.25) ? 1 : 0);
  const split = type === 'boss' ? 1 : count === 2 ? 0.62 : 1; // two enemies are each weaker
  const units = [];
  for (let i = 0; i < count; i++) {
    const cards = Array.from({ length: 2 }, () => ({ suit: rng.pick(SUIT_IDS), rank: 3, persona: rng.chance(0.1 + run.act * 0.12) ? rng.pick(PERSONA_IDS) : null }));
    const dose = rollDose(rng);
    const f = buildFighter(cards, dose, { seed: rng.seed(), name: type === 'boss' ? BOSSES[run.act] : `${type === 'elite' ? 'Elite ' : ''}${rng.pick(['Thug', 'Hustler', 'Brute', 'Shark', 'Goon'])}` });
    const m = pw * split;
    const stats = clampStats({ ...f.stats, hp: f.stats.hp * m * 1.15, atk: f.stats.atk * Math.pow(m, 0.75) });
    const parts = { ...f.parts };
    if (type === 'boss') { parts.head = 'crown'; parts.bulk = 1.35; parts.height = 1.3; parts.aura = { type: 'double', color: '#ff3355' }; }
    units.push({ uid: `enemy:${i}`, owner: 'enemy', name: f.name, kind: 'main', stats, weapon: f.weapon, range: f.range, projectile: f.projectile, specials: f.specials, parts });
  }
  return units;
}

export function partyUnits(run, echoes) {
  const lists = run.buffs.map((b) => b.mods);
  return run.party.filter((m) => m.hpFrac > 0).map((m, i) => {
    const e = echoes.find((x) => x.id === m.id);
    if (!e) return null;
    const stats = applyMods(echoBattleStats(e, 1), lists);
    return { uid: `party:${e.id}`, owner: 'party', name: e.name, kind: i === 0 ? 'main' : 'echo', stats, weapon: e.weapon, range: e.range, projectile: e.projectile, specials: { ...(e.specials || {}), clone: false }, parts: e.parts, hpFrac: m.hpFrac };
  }).filter(Boolean);
}

export function battleFor(run, type, echoes) {
  const units = [...partyUnits(run, echoes), ...makeEnemies(run, type)];
  const seed = hashSeed(`${run.seed}:${run.act}:${run.step}:battle`);
  return { units, seed, maxSeconds: 45 };
}

/** Resolve a fight's outcome into the run (does the sim again server-free — deterministic). */
export function resolveFight(run, type, battle) {
  const res = runBattle(battle.units, battle.seed, { maxSeconds: battle.maxSeconds });
  const won = res.winner === 'party';
  const alive = new Map(res.survivors.map((s) => [s.uid, s.hpFrac]));
  for (const m of run.party) {
    const uid = `party:${m.id}`;
    if (!battle.units.some((u) => u.uid === uid)) continue;
    m.hpFrac = alive.has(uid) ? alive.get(uid) : (won ? 0.2 : 0); // fallen allies limp back after a win
  }
  const reward = { dust: 0, tickets: 0, fame: 0 };
  if (won) {
    if (type === 'fight') { reward.dust = 12 + run.act * 6; reward.fame = 3; }
    if (type === 'elite') { reward.dust = 30 + run.act * 10; reward.tickets = 1; reward.fame = 8; }
    if (type === 'boss') { reward.dust = 40 + run.act * 15; reward.tickets = 3 + run.act * 2; reward.fame = 15 * (run.act + 1); }
  } else {
    run.over = true;
  }
  return { won, reward, res };
}

export function applyNode(run, type, echoes) {
  const rng = makeRng(hashSeed(`${run.seed}:${run.act}:${run.step}:${type}:node`));
  const out = { reward: { dust: 0, tickets: 0, fame: 0 }, text: '' };
  if (type === 'rest') {
    for (const m of run.party) m.hpFrac = Math.min(1, Math.max(m.hpFrac, 0) + 0.5);
    out.text = 'Your party rests. +50% HP.';
  } else if (type === 'treasure') {
    if (rng.chance(0.4)) { out.reward.tickets = 2; out.text = 'Found 2 Tickets!'; }
    else { out.reward.dust = 25 + rng.int(25) + run.act * 10; out.text = `Found ${out.reward.dust} Dust.`; }
  } else if (type === 'dose') {
    const dose = rollDose(rng);
    out.dose = dose;
    for (const e of dose.effects) if (e.mods.length) run.buffs.push({ name: e.name, desc: e.desc, mods: e.mods, rare: e.kind === 'rare' });
    out.text = 'The dose sticks for the rest of the run.';
  }
  return out;
}

export function advanceRun(run, type) {
  run.path.push({ act: run.act, step: run.step, type });
  if (run.over) return;
  if (type === 'boss') {
    if (run.act >= 2) { run.over = true; run.won = true; return; }
    run.act += 1; run.step = 0;
    for (const m of run.party) m.hpFrac = Math.max(m.hpFrac, 0.6); // a breather between acts
  } else {
    run.step += 1;
  }
}

export function partyAlive(run) {
  return run.party.some((m) => m.hpFrac > 0);
}
