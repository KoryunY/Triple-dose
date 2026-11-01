// Gacha: soft/hard pity, 50/50 with guarantee, 4★ every 10, rate-up 4★, standard banner.

import { GIRLS, GACHA, BANNERS } from '../../shared/data.js';

const FIVE_STANDARD = Object.keys(GIRLS).filter((id) => GIRLS[id].rarity === 5 && GIRLS[id].standard);
const FOUR = Object.keys(GIRLS).filter((id) => GIRLS[id].rarity === 4);

export function rate5(pity) {
  // pity = pulls since last 5★ (this pull is pity+1)
  const n = pity + 1;
  if (n >= GACHA.hardPity) return 1;
  if (n >= GACHA.softPityStart) return Math.min(1, GACHA.base5 + (n - GACHA.softPityStart + 1) * GACHA.softPityStep);
  return GACHA.base5;
}

/**
 * Do `count` pulls on a banner. Mutates profile (tickets, pity, girls, dust, history).
 * rand: () => [0,1)
 */
export function doPulls(profile, bannerId, count, rand = Math.random) {
  const banner = BANNERS.find((b) => b.id === bannerId);
  if (!banner) return { ok: false, error: 'Unknown banner' };
  if (profile.tickets < count) return { ok: false, error: `Need ${count} ticket${count > 1 ? 's' : ''}` };
  profile.tickets -= count;
  const std = !!banner.standard;
  const k5 = std ? 'standard5' : 'limited5';
  const k4 = std ? 'standard4' : 'limited4';
  const results = [];

  for (let i = 0; i < count; i++) {
    const p = profile.pity;
    let item;
    if (rand() < rate5(p[k5])) {
      let id;
      let lost5050 = false;
      if (std) id = pick(FIVE_STANDARD, rand);
      else if (p.guaranteed || rand() < 0.5) { id = banner.featured; p.guaranteed = false; }
      else { id = pick(FIVE_STANDARD, rand); p.guaranteed = true; lost5050 = true; }
      item = { type: 'girl', id, rarity: 5, lost5050, pity: p[k5] + 1 };
      p[k5] = 0;
      p[k4] += 1;
    } else if (p[k4] + 1 >= GACHA.pity4 || rand() < GACHA.base4) {
      const id = !std && rand() < GACHA.rateUp4Share ? pick(banner.rateUp4, rand) : pick(FOUR, rand);
      item = { type: 'girl', id, rarity: 4 };
      p[k4] = 0;
      p[k5] += 1;
    } else {
      item = { type: 'dust', amount: GACHA.dustPer3, rarity: 3 };
      p[k5] += 1;
      p[k4] += 1;
    }
    grant(profile, item);
    results.push(item);
  }
  profile.pullHistory.unshift(...results.filter((r) => r.rarity >= 4).map((r) => ({ id: r.id, rarity: r.rarity, banner: bannerId, t: Date.now() })));
  profile.pullHistory = profile.pullHistory.slice(0, 50);
  return { ok: true, results };
}

function grant(profile, item) {
  if (item.type === 'dust') { profile.dust += item.amount; return; }
  const owned = profile.girls[item.id];
  if (!owned) { profile.girls[item.id] = { bond: 0 }; item.isNew = true; return; }
  if (owned.bond < GACHA.maxBond) { owned.bond += 1; item.bondUp = owned.bond; return; }
  const dust = item.rarity === 5 ? GACHA.dustPerDupe5Overflow : GACHA.dustPerDupe4Overflow;
  profile.dust += dust;
  item.overflowDust = dust;
}

function pick(arr, rand) { return arr[Math.floor(rand() * arr.length)]; }

export function pityInfo(profile, bannerId) {
  const std = BANNERS.find((b) => b.id === bannerId)?.standard;
  const p = profile.pity;
  return {
    five: std ? p.standard5 : p.limited5,
    four: std ? p.standard4 : p.limited4,
    guaranteed: !std && p.guaranteed,
    hard: GACHA.hardPity,
  };
}
