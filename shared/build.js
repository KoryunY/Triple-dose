// Turns played cards + dice dose + patron + edicts into a fighter (stats + visual parts).

import {
  BASE_STATS, STAT_CAPS, SUITS, CARD_BASE_PER_RANK, PERSONAS, DICE_FACES, STATUSES,
  COMMON_PAIRS, RARE_TABLES, DOUBLE_DOSE, GIRLS, SMOKE_DIE, DRINK_DIE, ECHO,
} from './data.js';
import { makeRng } from './rng.js';

const RARITY_ORDER = { ash: 0, pipe: 1, herb: 2, water: 0, fizz: 1, shine: 2 };

// ---------------------------------------------------------------- dice

/**
 * Roll the two dose dice for one player.
 * opts.advantage: roll twice and keep the rarer face (Velvet Decree)
 * opts.shineFace: drink die gets an extra Moonshine face (Selene)
 */
export function rollDose(rng, opts = {}) {
  const drinkDie = opts.shineFace ? [...DRINK_DIE.slice(0, 5), 'shine', 'shine'] : DRINK_DIE;
  const roll = (die) => {
    const a = rng.pick(die);
    if (!opts.advantage) return a;
    const b = rng.pick(die);
    return RARITY_ORDER[b] > RARITY_ORDER[a] ? b : a;
  };
  const smoke = roll(SMOKE_DIE);
  const drink = roll(drinkDie);
  const dose = { smoke, drink, effects: [] };

  const faces = [smoke, drink];
  const rareCount = faces.filter((f) => DICE_FACES[f].rare).length;
  const double = rareCount === 2;
  if (double) dose.double = true;

  for (const f of faces) {
    const face = DICE_FACES[f];
    if (face.rare) {
      const table = RARE_TABLES[face.table];
      const outcome = table.outcomes[rng.int(table.outcomes.length)];
      let mods = outcome.mods;
      let name = outcome.name;
      let desc = outcome.desc;
      if (outcome.coin) {
        const heads = rng.chance(0.5);
        mods = heads ? outcome.heads : outcome.tails;
        name = `${outcome.name}: ${heads ? 'Lucky' : 'Wasted'}`;
        desc = heads ? '+50% ATK' : '−15% to everything';
      }
      const scale = double ? 2 : 1;
      dose.effects.push({
        kind: 'rare', face: f, table: table.name, id: outcome.id, name, desc: double ? `${desc} (×2)` : desc,
        mods: mods.map((m) => scaleMod(m, scale)),
      });
    } else {
      const st = STATUSES[face.status];
      dose.effects.push({ kind: 'status', face: f, id: face.status, name: st.name, desc: st.desc, mods: st.mods });
    }
  }
  if (rareCount === 0) {
    const pair = COMMON_PAIRS[`${smoke}+${drink}`];
    if (pair) dose.effects.push({ kind: 'pair', id: `${smoke}+${drink}`, name: pair.name, desc: pair.desc, mods: pair.mods });
  }
  if (double) dose.effects.unshift({ kind: 'double', id: 'double', name: DOUBLE_DOSE.name, desc: DOUBLE_DOSE.desc, mods: [] });
  return dose;
}

function scaleMod(m, s) {
  const out = { stat: m.stat };
  if (m.add !== undefined) out.add = m.add * s;
  if (m.mult !== undefined) out.mult = m.mult * s;
  return out;
}

// ---------------------------------------------------------------- combos

export function detectCombos(cards) {
  const combos = [];
  if (!cards.length) return combos;
  const bySuit = {};
  for (const c of cards) bySuit[c.suit] = (bySuit[c.suit] || 0) + 1;
  const counts = Object.values(bySuit);
  if (counts.includes(3)) combos.push('triad');
  else if (counts.includes(2)) combos.push('pair');
  if (cards.length === 3 && counts.length === 3) combos.push('spectrum');
  if (cards.length === 3) {
    const r = cards.map((c) => c.rank).sort((a, b) => a - b);
    if (r[1] === r[0] + 1 && r[2] === r[1] + 1) combos.push('run');
  }
  return combos;
}

const COMBO_MODS = {
  pair: ['hp', 'atk', 'aspd', 'spd'].map((stat) => ({ stat, mult: 0.1 })),
  triad: ['hp', 'atk', 'aspd', 'spd'].map((stat) => ({ stat, mult: 0.25 })),
  spectrum: [{ stat: 'crit', add: 0.1 }, { stat: 'dodge', add: 0.08 }],
  run: [{ stat: 'aspd', mult: 0.2 }],
};

// ---------------------------------------------------------------- patron

export function patronMods(patron) {
  if (!patron) return { mods: [], specials: {} };
  const g = GIRLS[patron.id];
  if (!g) return { mods: [], specials: {} };
  const p = g.passive;
  const bond = patron.bond || 0;
  const mods = [];
  const specials = {};
  const val = (base) => base + (p.perBond || 0) * bond;
  if (p.stat) mods.push(p.add !== undefined ? { stat: p.stat, add: val(p.add) } : { stat: p.stat, mult: val(p.mult) });
  if (p.also) mods.push({ stat: p.also.stat, mult: val(p.also.mult) });
  if (p.special === 'revive') specials.revive = val(p.value);
  if (p.special === 'firstCrit') specials.firstCrit = true;
  if (p.special === 'shineFace') specials.shineFace = true;
  if (p.special === 'extraCard') specials.extraCard = true;
  return { mods, specials };
}

export function patronValue(patronId, bond = 0) {
  const p = GIRLS[patronId]?.passive;
  if (!p) return 0;
  const base = p.value ?? p.add ?? p.mult ?? 0;
  const v = base + (p.perBond || 0) * bond;
  return p.pct ? Math.round(v * 100) : Math.round(v * 10) / 10;
}

export function patronDesc(patronId, bond = 0) {
  const p = GIRLS[patronId]?.passive;
  if (!p) return '';
  return p.desc.replace('{v}', patronValue(patronId, bond));
}

// ---------------------------------------------------------------- stat math

export function applyMods(base, modLists) {
  const add = {};
  const mult = {};
  for (const list of modLists) {
    for (const m of list || []) {
      if (m.add !== undefined) add[m.stat] = (add[m.stat] || 0) + m.add;
      if (m.mult !== undefined) mult[m.stat] = (mult[m.stat] || 0) + m.mult;
    }
  }
  const out = {};
  for (const k of Object.keys(BASE_STATS)) {
    const v = ((base[k] ?? BASE_STATS[k]) + (add[k] || 0)) * (1 + (mult[k] || 0));
    out[k] = v;
  }
  return clampStats(out);
}

export function clampStats(s) {
  const out = { ...s };
  out.hp = Math.max(45, out.hp);
  out.atk = Math.max(1, out.atk);
  out.spd = Math.max(0.8, out.spd);
  out.aspd = Math.max(0.3, Math.min(4, out.aspd));
  out.critDmg = Math.max(1.1, out.critDmg);
  out.regen = Math.max(0, out.regen);
  for (const [k, cap] of Object.entries(STAT_CAPS)) out[k] = Math.max(0, Math.min(cap, out[k]));
  out.accuracy = Math.max(0.5, out.accuracy);
  return out;
}

// ---------------------------------------------------------------- fighter

/**
 * cards: [{suit, rank, persona?}]
 * dose: result of rollDose
 * ctx: { patron:{id,bond}, edictMods:[], seed, name, owner }
 */
export function buildFighter(cards, dose, ctx = {}) {
  const rng = makeRng(ctx.seed || 1);
  const lists = [];
  const sources = [];

  // Card contributions
  const suitRank = {};
  for (const c of cards) {
    const s = SUITS[c.suit];
    const mods = [];
    for (const [stat, per] of Object.entries(s.perRank)) mods.push({ stat, add: per * c.rank });
    for (const [stat, per] of Object.entries(CARD_BASE_PER_RANK)) mods.push({ stat, add: per * c.rank });
    lists.push(mods);
    suitRank[c.suit] = (suitRank[c.suit] || 0) + c.rank;
  }

  // Weapon = strongest suit (first played wins ties)
  let weaponSuit = cards[0]?.suit || 'blade';
  for (const c of cards) if (suitRank[c.suit] > suitRank[weaponSuit]) weaponSuit = c.suit;
  const W = SUITS[weaponSuit];

  // Personas (hidden or not, they always apply)
  const specials = {};
  for (const c of cards) {
    if (!c.persona) continue;
    const p = PERSONAS[c.persona];
    lists.push(p.mods);
    if (p.special) specials[p.special] = true;
    sources.push({ kind: 'persona', id: c.persona, hidden: !c.revealed });
  }
  if (specials.chaos) {
    const pool = ['hp', 'atk', 'aspd', 'spd'];
    const up = rng.pick(pool);
    const down = rng.pick(pool.filter((x) => x !== up));
    lists.push([{ stat: up, mult: 0.4 }, { stat: down, mult: -0.2 }]);
  }

  // Combos
  const combos = detectCombos(cards);
  for (const c of combos) { lists.push(COMBO_MODS[c]); sources.push({ kind: 'combo', id: c }); }

  // Dose
  if (dose) for (const e of dose.effects) { lists.push(e.mods); sources.push({ kind: 'dose', id: e.id, name: e.name }); }

  // Patron
  const pm = patronMods(ctx.patron);
  lists.push(pm.mods);
  if (pm.specials.revive) specials.revive = Math.max(specials.revive ? 0.4 : 0, pm.specials.revive);
  if (pm.specials.firstCrit) specials.firstCrit = true;
  if (specials.revive === true) specials.revive = 0.4;

  // Edicts (e.g. Iron Crown)
  if (ctx.edictMods) lists.push(ctx.edictMods);

  const stats = applyMods(BASE_STATS, lists);
  const parts = makeParts(cards, dose, stats, weaponSuit, rng);

  return {
    name: ctx.name || 'Fighter',
    owner: ctx.owner,
    stats,
    weapon: W.weapon,
    weaponSuit,
    range: W.range,
    projectile: W.projectile,
    specials,
    combos,
    sources,
    parts,
    power: powerScore(stats, W.range),
  };
}

// A rough single number for UI and bots.
export function powerScore(s, range = 1.7) {
  const dps = s.atk * s.aspd * (1 + s.crit * (s.critDmg - 1)) * s.accuracy;
  const ehp = (s.hp / (1 - s.armor)) / (1 - s.dodge) + s.regen * 20;
  const rangeBonus = range > 3 ? 1.15 : 1;
  return Math.round(Math.sqrt(dps * ehp) * rangeBonus * 10);
}

// Visual parts — each part shows a buff so players can "read" a fighter.
const HEADS = ['bare', 'hood', 'helm', 'horns', 'crown', 'mask'];
const BODIES = ['vest', 'robe', 'plate', 'coat'];

function makeParts(cards, dose, stats, weaponSuit, rng) {
  const suitsSorted = [...new Set(cards.map((c) => c.suit))];
  const primary = SUITS[weaponSuit].color;
  const secondary = SUITS[suitsSorted.find((s) => s !== weaponSuit) || weaponSuit].color;
  const hasPersona = (id) => cards.some((c) => c.persona === id);

  // Head shows CRIT
  let head = stats.crit > 0.3 ? 'mask' : stats.crit > 0.18 ? 'horns' : rng.pick(['bare', 'hood', 'helm']);
  if (hasPersona('king') || hasPersona('queen')) head = 'crown';
  // Body bulk shows HP/ARMOR
  const body = stats.armor > 0.2 ? 'plate' : stats.hp > 440 ? 'coat' : stats.regen > 4.6 ? 'robe' : rng.pick(BODIES);
  const bulk = Math.max(0.85, Math.min(1.35, 0.75 + stats.hp / 920));
  // Legs show SPD, arms show ATK SPD
  const legs = stats.spd > 2.8 ? 'runner' : stats.spd < 1.9 ? 'heavy' : 'normal';
  const arms = stats.aspd > 1.5 ? 'quick' : 'normal';
  // Aura shows dose
  let aura = null;
  if (dose) {
    if (dose.double) aura = { type: 'double', color: '#ffd700' };
    else if (dose.smoke === 'herb') aura = { type: 'haze', color: '#7dff9a' };
    else if (dose.drink === 'shine') aura = { type: 'shine', color: '#b9a3ff' };
    else if (dose.smoke === 'pipe') aura = { type: 'cloud', color: '#d8e2ff' };
    else if (dose.drink === 'fizz') aura = { type: 'spark', color: '#ffe066' };
  }
  const glow = stats.lifesteal > 0.12 ? '#ff2e4d' : stats.regen > 5.8 ? '#6dffb0' : null;
  const skinTones = ['#f2c9a8', '#e0ac85', '#c68a62', '#9a6a48', '#ffe0c8', '#b8c4ff'];
  return {
    head, body, bulk, legs, arms, aura, glow,
    weapon: SUITS[weaponSuit].weapon,
    primary, secondary,
    skin: rng.pick(skinTones),
    eye: stats.crit > 0.2 ? '#ff3355' : '#ffffff',
    height: 0.9 + rng.next() * 0.25,
  };
}

// ---------------------------------------------------------------- echoes

export function echoFromFighter(fighter, meta = {}) {
  return {
    id: meta.id,
    name: meta.name || fighter.name,
    born: meta.born || 0,
    level: 0,
    stats: fighter.stats,
    weapon: fighter.weapon,
    weaponSuit: fighter.weaponSuit,
    range: fighter.range,
    projectile: fighter.projectile,
    specials: fighter.specials,
    parts: fighter.parts,
    power: fighter.power,
    origin: meta.origin || 'match',
  };
}

export function echoBattleStats(echo, power = 1) {
  const lvl = 1 + ECHO.levelStatMult * (echo.level || 0);
  const s = { ...echo.stats };
  s.hp *= power * lvl;
  s.atk *= power * lvl;
  return clampStats(s);
}
