// Reusable UI pieces: cards, stat grids, fighter previews, dose summaries.

import { h, svgEl, esc } from './dom.js';
import { SUITS, PERSONAS, STAT_LABELS, BASE_STATS, DICE_FACES, COMBOS, GIRLS, EDICTS } from '../../shared/data.js';
import { suitIcon, personaIcon, statIcon, diceFaceIcon } from '../art/icons.js';
import { portraitSVG } from '../art/portrait.js';

export function cardEl(card, { selected, dim, onClick } = {}) {
  const s = SUITS[card.suit];
  const el = h('div', {
    class: `card${selected ? ' sel' : ''}${dim ? ' dim' : ''}${card.shimmer ? ' shimmer' : ''}`,
    style: { '--c': s.color },
    onClick,
    title: `${s.name} ${card.rank}${card.persona ? ` — ${PERSONAS[card.persona].name}` : ''}`,
  },
  h('div', { class: 'rk' }, card.rank),
  svgEl(suitIcon(card.suit)),
  card.persona ? h('div', { class: 'ps' }, svgEl(personaIcon(card.persona))) : null);
  return el;
}

const SHOW_STATS = ['hp', 'atk', 'aspd', 'spd', 'crit', 'critDmg', 'dodge', 'armor'];
const PCT = new Set(['crit', 'dodge', 'armor', 'lifesteal', 'accuracy']);

export function fmtStat(k, v) {
  if (PCT.has(k)) return `${Math.round(v * 100)}%`;
  if (k === 'critDmg') return `${Math.round(v * 100)}%`;
  if (k === 'aspd' || k === 'spd') return v.toFixed(2);
  if (k === 'regen') return v.toFixed(1);
  return Math.round(v);
}

export function statGrid(stats, extra = []) {
  const keys = [...SHOW_STATS];
  if (stats.lifesteal > 0.001) keys.push('lifesteal');
  if (stats.regen > 0.05) keys.push('regen');
  for (const k of extra) if (!keys.includes(k)) keys.push(k);
  return h('div', { class: 'stats' }, keys.map((k) => {
    const base = BASE_STATS[k];
    const cls = stats[k] > base * 1.001 + (PCT.has(k) ? 0.001 : 0) ? 'up' : stats[k] < base * 0.999 ? 'down' : '';
    return h('div', { class: `stat ${cls}` }, h('b', {}, fmtStat(k, stats[k])), svgEl(statIcon(k)), ` ${STAT_LABELS[k]}`);
  }));
}

export function doseTags(dose) {
  if (!dose) return [];
  return dose.effects.map((e) => h('span', { class: `tag ${e.kind === 'rare' || e.kind === 'double' ? 'rare' : ''}`, title: e.desc }, e.name));
}

export function fighterPreview(f, { title, player, cards, dose, showDose = true } = {}) {
  const tags = [];
  for (const c of f.combos || []) tags.push(h('span', { class: 'tag combo', title: COMBOS[c].desc }, COMBOS[c].name));
  for (const s of f.sources || []) {
    if (s.kind === 'persona') tags.push(h('span', { class: 'tag persona' }, s.hidden || !s.id ? '??? hidden' : PERSONAS[s.id].name));
  }
  if (showDose) {
    for (const s of f.sources || []) if (s.kind === 'dose') tags.push(h('span', { class: `tag ${/haze|lastCall|double/.test(s.id) ? 'rare' : ''}` }, s.name));
    if (!f.sources && dose) tags.push(...doseTags(dose));
  }
  const weapon = SUITS[f.weaponSuit]?.weapon || f.weapon;
  return h('div', { class: 'preview' },
    h('div', { class: 'hd' },
      player ? svgEl(portraitSVG(player.patron?.id || 'nao', { variant: 'chibi' }), 'avatar') : null,
      h('b', {}, title || f.name || 'Fighter', h('div', { class: 'small muted' }, `${SUITS[f.weaponSuit]?.name || ''} · ${weapon}`)),
      h('span', { class: 'power' }, `⚡${f.power}`)),
    cards ? h('div', { class: 'mini-cards' }, cards.map((c) => cardEl(c))) : null,
    statGrid(f.stats),
    tags.length ? h('div', { class: 'tags' }, tags) : null);
}

export function doseFaceEl(face) {
  return h('div', { class: 'col center', style: { gap: '2px', alignItems: 'center' } },
    svgEl(diceFaceIcon(face)), h('div', { class: 'nm' }, DICE_FACES[face].name));
}

export function dosePop(dose, { title } = {}) {
  return h('div', { class: `dose-pop${dose.double ? ' double' : ''}` },
    dose.double ? h('div', { class: 'big-title' }, 'DOUBLE DOSE!') : h('div', { class: 'small muted' }, title || 'Your dose this round'),
    h('div', { class: 'faces' }, doseFaceEl(dose.smoke), doseFaceEl(dose.drink)),
    dose.effects.filter((e) => e.kind !== 'double').map((e) => h('div', { class: `eff ${e.kind === 'rare' ? 'rare' : ''}` },
      h('b', {}, e.name), e.table ? h('span', { class: 'muted' }, ` · ${e.table}`) : null, h('div', { class: 'muted' }, e.desc))));
}

export function edictTags(edicts = [], players = []) {
  return edicts.map((e) => {
    const who = players.find((p) => p.id === e.owner)?.name || '?';
    return h('span', { class: 'tag edict', title: EDICTS[e.id]?.desc }, `${EDICTS[e.id]?.name} (${who})`);
  });
}

export function girlName(id) { return GIRLS[id]?.name || id; }
export { esc };
