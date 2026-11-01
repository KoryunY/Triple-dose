// Echoes: fighters you won with. Equip into slots (by Fame rank), level up with Dust, release.

import { h, btn, svgEl, modal, toast, clearEl, confirmBox } from './dom.js';
import { getProfile, onProfile, toggleEquip, levelUpEcho, releaseEcho, renameEcho, echoSlots, rank } from '../core/profile.js';
import { ECHO, SUITS, FAME_RANKS } from '../../shared/data.js';
import { echoBattleStats, powerScore } from '../../shared/build.js';
import { echoBadgeSVG } from '../art/echoBadge.js';
import { statGrid } from './parts.js';
import { audio } from '../audio/audio.js';

export function openEchoes(nav) {
  const ui = document.getElementById('ui');
  const root = h('div', { class: 'screen scroll', style: { background: '#0a0710e8' } });
  ui.append(root);
  audio.music('menu');

  function render() {
    const p = getProfile();
    const slots = echoSlots();
    clearEl(root);
    const nextSlot = FAME_RANKS.find((r) => r.echoSlots > slots);
    root.append(
      h('div', { class: 'topbar' }, btn('←', () => nav('home'), 'icon ghost'), h('h1', {}, 'Echoes'), h('span', { class: 'chip' }, '✦ ', String(p.dust))),
      h('p', { class: 'small muted' }, `Equipped ${p.equipped.length}/${slots}. Equipped Echoes come with you to matches (once per match each, at 60% power) and form your Expedition party.${nextSlot ? ` More slots at ${nextSlot.name} rank (${nextSlot.min} Fame).` : ''}`),
      p.echoes.length ? h('div', { class: 'grid' }, p.echoes.map((e) => {
        const eq = p.equipped.includes(e.id);
        return h('div', { class: `tile echo-tile${eq ? ' eq' : ''}`, onClick: () => detail(e.id) },
          svgEl(echoBadgeSVG(e.parts)),
          h('div', { class: 'badge' }, `Lv${e.level || 0}`),
          eq ? h('div', { class: 'badge r', style: { color: 'var(--cyan)' } }, 'EQ') : null,
          h('div', { class: 'lbl' }, e.name, h('div', { class: 'small muted' }, `⚡${powerOf(e)} · ${SUITS[e.weaponSuit]?.name || ''}`)));
      })) : h('div', { class: 'center muted', style: { marginTop: '40px' } }, h('p', {}, 'No Echoes yet.'), h('p', { class: 'small' }, 'Win a battle at the table — your fighter becomes an Echo.'), btn('Play vs bots', () => nav('solo'), 'primary')));
  }

  function powerOf(e) {
    return powerScore(echoBattleStats(e, 1), e.range);
  }

  function detail(id) {
    const p = getProfile();
    const e = p.echoes.find((x) => x.id === id);
    if (!e) return;
    const eq = p.equipped.includes(id);
    const lvl = e.level || 0;
    const cost = ECHO.levelCost(lvl);
    let nameInput;
    const m = modal(h('div', {},
      h('div', { style: { height: '150px', display: 'flex', justifyContent: 'center' } }, svgEl(echoBadgeSVG(e.parts), 'big')),
      h('div', { class: 'row' }, nameInput = h('input', { value: e.name, maxlength: '18', style: { flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--line)', background: '#0f0b18', color: 'inherit', fontWeight: 800, fontSize: '16px', minWidth: 0 } }), btn('Rename', () => { renameEcho(id, nameInput.value); toast('Renamed', 'good'); }, 'small ghost')),
      h('p', { class: 'small muted' }, `${SUITS[e.weaponSuit]?.name} · ${e.weapon} · Level ${lvl}/${ECHO.maxLevel} · ⚡${powerOf(e)}`),
      statGrid(echoBattleStats(e, 1)),
      h('p', { class: 'small muted' }, 'Stats shown at full power. In matches Echoes fight at 60%.'),
      h('div', { class: 'row wrap', style: { marginTop: '10px' } },
        btn(eq ? 'Unequip' : 'Equip', () => { const r = toggleEquip(id); if (!r.ok) toast(r.error, 'bad'); else audio.sfx('tap'); m.close(); }, eq ? 'ghost' : 'cyan'),
        lvl < ECHO.maxLevel ? btn(`Level up (✦${cost})`, () => { const r = levelUpEcho(id); if (!r.ok) { toast(r.error, 'bad'); audio.sfx('error'); } else { audio.sfx('coin'); m.close(); detail(id); } }, 'gold') : h('span', { class: 'chip' }, 'Max level'),
        btn('Release', async () => { m.close(); if (await confirmBox(`Release ${e.name}? You get Dust back.`, 'Release')) { const r = releaseEcho(id); toast(`+${r.dust} Dust`, 'good'); } }, 'ghost'))), { cls: 'center' });
    const big = m.box.querySelector('.big'); if (big) { big.style.height = '150px'; big.style.width = '150px'; }
  }

  const off = onProfile(render);
  render();
  return { close() { off(); root.remove(); } };
}
