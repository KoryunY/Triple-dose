// Girls collection: owned patrons, bond, passive; pick your patron for the table.

import { h, btn, svgEl, modal, toast, clearEl } from './dom.js';
import { getProfile, setPatron, onProfile } from '../core/profile.js';
import { GIRLS, GIRL_IDS, SUITS } from '../../shared/data.js';
import { portraitSVG } from '../art/portrait.js';
import { starsSVG, suitIcon } from '../art/icons.js';
import { patronDesc } from '../../shared/build.js';
import { audio } from '../audio/audio.js';

export function openGirls(nav) {
  const ui = document.getElementById('ui');
  const root = h('div', { class: 'screen scroll', style: { background: '#0a0710e8' } });
  ui.append(root);
  audio.music('menu');

  function render() {
    const p = getProfile();
    clearEl(root);
    const owned = GIRL_IDS.filter((id) => p.girls[id]);
    root.append(
      h('div', { class: 'topbar' }, btn('←', () => nav('home'), 'icon ghost'), h('h1', {}, `Girls (${owned.length}/${GIRL_IDS.length})`), btn('Banners', () => nav('gacha'), 'small gold')),
      h('p', { class: 'small muted' }, 'Your patron sits beside you at the table and powers up every fighter you summon. Duplicates raise Bond.'),
      h('div', { class: 'grid' }, [...GIRL_IDS].sort((a, b) => (p.girls[b] ? 1 : 0) - (p.girls[a] ? 1 : 0) || GIRLS[b].rarity - GIRLS[a].rarity).map((id) => {
        const g = GIRLS[id];
        const own = p.girls[id];
        return h('div', {
          class: `tile${own ? '' : ' locked'}${p.patron === id ? ' patron' : ''}`,
          style: { '--rc': g.rarity === 5 ? '#ffd16699' : '#c77dff88' },
          onClick: () => own ? detail(id) : toast('Not unlocked yet — find her on the Banners'),
        },
        svgEl(portraitSVG(id, { variant: 'bust', bg: true })),
        h('div', { class: 'badge' }, `${g.rarity}★`),
        own ? h('div', { class: 'badge r' }, `B${own.bond}`) : null,
        h('div', { class: 'lbl' }, g.name.split(' ')[0], p.patron === id ? ' ♛' : ''));
      })));
  }

  function detail(id) {
    const p = getProfile();
    const g = GIRLS[id];
    const bond = p.girls[id].bond;
    const m = modal(h('div', {},
      h('div', { style: { height: '46vh', display: 'flex', justifyContent: 'center' } }, svgEl(portraitSVG(id, { variant: 'splash', bg: true }), 'full')),
      h('h2', { style: { marginTop: '8px' } }, g.name),
      h('div', { class: 'row small' }, svgEl(starsSVG(g.rarity), 'stars'), h('span', { class: 'muted' }, g.title), svgEl(suitIcon(g.suit), 'mini'), h('span', { style: { color: SUITS[g.suit].color } }, SUITS[g.suit].name)),
      h('p', {}, h('b', {}, `${g.passive.name} (Bond ${bond}/6): `), patronDesc(id, bond)),
      h('p', { class: 'small muted' }, g.lore),
      p.patron === id ? h('div', { class: 'chip' }, '♛ Current patron') : btn('Set as patron', () => { setPatron(id); audio.sfx('coin'); toast(`${g.name} will sit with you`, 'good'); m.close(); }, 'primary')), { cls: 'center' });
    m.box.querySelectorAll('.stars').forEach((e) => { e.style.height = '16px'; e.style.width = '80px'; });
    m.box.querySelectorAll('.mini').forEach((e) => { e.style.width = '18px'; e.style.height = '18px'; });
    const full = m.box.querySelector('.full'); if (full) full.style.height = '100%';
  }

  const off = onProfile(render);
  render();
  return { close() { off(); root.remove(); } };
}
