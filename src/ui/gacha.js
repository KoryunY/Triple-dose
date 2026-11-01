// Banners: featured anime girls, 1 and 10 pulls, pity display, pull animation and reveals.

import { h, btn, svgEl, toast, modal, clearEl } from './dom.js';
import { getProfile, saveProfile, onProfile } from '../core/profile.js';
import { doPulls, pityInfo } from '../core/gacha.js';
import { BANNERS, GIRLS, GACHA } from '../../shared/data.js';
import { portraitSVG } from '../art/portrait.js';
import { starsSVG, suitIcon } from '../art/icons.js';
import { patronDesc } from '../../shared/build.js';
import { audio } from '../audio/audio.js';

const GLOW = { 5: '#ffd166', 4: '#c77dff', 3: '#4fd1ff' };

export function openGacha(nav) {
  const ui = document.getElementById('ui');
  const root = h('div', { class: 'screen gacha' });
  ui.append(root);
  audio.music('gacha');
  let bannerId = BANNERS[0].id;
  let animating = false;

  function render() {
    const p = getProfile();
    const b = BANNERS.find((x) => x.id === bannerId);
    const featured = b.featured ? GIRLS[b.featured] : null;
    const pity = pityInfo(p, bannerId);
    clearEl(root);
    root.append(
      h('div', { class: 'topbar' },
        btn('←', () => nav('home'), 'icon ghost'),
        h('h1', {}, 'Banners'),
        h('span', { class: 'chip' }, '🎟 ', String(p.tickets)),
        h('span', { class: 'chip' }, '✦ ', String(p.dust))),
      h('div', { class: 'banner-tabs' }, BANNERS.map((x) => h('button', {
        class: x.id === bannerId ? 'on' : '',
        onClick: () => { bannerId = x.id; audio.sfx('tap'); render(); },
        title: x.name,
      }, svgEl(portraitSVG(x.featured || 'aya', { variant: 'chibi' }))))),
      h('div', { class: 'splash', style: { background: `linear-gradient(160deg, ${b.theme[0]}55, ${b.theme[1]})` } },
        svgEl(portraitSVG(b.featured || 'aya', { variant: 'splash', theme: b.theme, bg: true })),
        h('div', { class: 'info' },
          h('div', { class: 'small', style: { color: b.theme[0], fontWeight: 800, letterSpacing: '2px' } }, b.standard ? 'STANDARD BANNER' : 'LIMITED BANNER'),
          h('h2', {}, b.name),
          featured ? h('div', { class: 'feat' }, svgEl(starsSVG(5), 'stars'), h('span', {}, `${featured.name} — ${featured.title}`)) : h('div', { class: 'feat' }, 'Aya, Lumi and Vera — standard 5★ pool'),
          featured ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, `${featured.passive.name}: ${patronDesc(b.featured, 0)}`) : null,
          h('div', { class: 'row small', style: { marginTop: '8px', gap: '6px', flexWrap: 'wrap' } },
            h('span', { class: 'chip' }, `5★ pity ${pity.five}/${pity.hard}`),
            h('span', { class: 'chip' }, `4★ ${pity.four}/${GACHA.pity4}`),
            !b.standard ? h('span', { class: 'chip', style: { color: pity.guaranteed ? 'var(--gold)' : '' } }, pity.guaranteed ? 'Next 5★ guaranteed featured' : '50/50 active') : null,
            btn('Details', () => details(b), 'small ghost')))),
      h('div', { class: 'pull-row' },
        btn(h('span', {}, 'Pull ×1', h('small', {}, ' 🎟1')), () => pull(1), 'ghost'),
        btn(h('span', {}, 'Pull ×10', h('small', {}, ' 🎟10')), () => pull(10), 'gold')));
  }

  function details(b) {
    const rateUp = b.rateUp4?.map((id) => GIRLS[id].name).join(', ');
    modal(h('div', {},
      h('h2', {}, b.name),
      h('p', { class: 'small' }, `5★ base rate ${(GACHA.base5 * 100).toFixed(1)}%, rising sharply from pull ${GACHA.softPityStart}; guaranteed by pull ${GACHA.hardPity}.`),
      !b.standard ? h('p', { class: 'small' }, 'Each 5★ is a 50/50 between the featured girl and the standard pool. Lose it, and your next 5★ is guaranteed featured. Pity and guarantee carry over between limited banners.') : h('p', { class: 'small' }, 'Every 5★ comes from the standard pool. Same pity counts as limited banners, tracked separately.'),
      h('p', { class: 'small' }, `4★ rate ${(GACHA.base4 * 100).toFixed(0)}%, guaranteed every ${GACHA.pity4} pulls.${rateUp ? ` Rate-up 4★: ${rateUp}.` : ''}`),
      h('p', { class: 'small muted' }, `3★ pulls give ${GACHA.dustPer3} Dust. Duplicates raise a girl's Bond (max ${GACHA.maxBond}), strengthening her passive.`),
      h('p', { class: 'small muted' }, 'Tickets come from matches and expeditions. No real money involved.')), { cls: 'center' });
  }

  async function pull(n) {
    if (animating) return;
    const p = getProfile();
    const r = doPulls(p, bannerId, n);
    if (!r.ok) { toast(r.error, 'bad'); audio.sfx('error'); return; }
    saveProfile();
    animating = true;
    await playAnimation(r.results);
    animating = false;
    render();
  }

  const off = onProfile(() => { if (!animating) render(); });
  render();
  return { close() { off(); root.remove(); } };
}

async function playAnimation(results) {
  const best = Math.max(...results.map((r) => r.rarity));
  const glow = GLOW[best];
  audio.sfx('pull');
  const anim = h('div', { class: 'pull-anim', style: { '--glow': glow } }, h('div', { class: 'rays' }), h('div', { class: 'orb' }));
  document.body.append(anim);
  let skip = false;
  anim.addEventListener('click', () => { skip = true; });
  await wait(1500, () => skip);
  anim.remove();
  if (best === 5) audio.sfx('pull5'); else if (best === 4) audio.sfx('pull4');

  // reveal 4★ and 5★ one by one (tap to continue / skip)
  const special = results.filter((r) => r.rarity >= 4);
  for (const r of special) {
    if (skip && r.rarity < 5) continue;
    await reveal(r);
  }
  await summary(results);
}

function reveal(r) {
  return new Promise((resolve) => {
    const g = GIRLS[r.id];
    const el = h('div', { class: 'reveal', style: { '--glow': GLOW[r.rarity] } },
      h('div', { class: 'art' }, svgEl(portraitSVG(r.id, { variant: 'splash', bg: false }))),
      svgEl(starsSVG(r.rarity), 'stars'),
      h('div', { class: 'nm' }, g.name),
      h('div', { class: 'muted' }, g.title, ' · ', svgEl(suitIcon(g.suit), 'mini')),
      r.isNew ? h('div', { class: 'new' }, 'NEW') : r.bondUp ? h('div', { class: 'new' }, `BOND ${r.bondUp}`) : r.overflowDust ? h('div', { class: 'muted' }, `Max bond → +${r.overflowDust} Dust`) : null,
      r.lost5050 ? h('div', { class: 'small muted' }, 'Lost the 50/50 — next 5★ is guaranteed featured') : null,
      h('div', { class: 'tap' }, 'Tap to continue'));
    el.querySelector('.stars')?.style.setProperty('height', '22px');
    el.querySelector('.mini')?.style.setProperty('width', '18px');
    document.body.append(el);
    if (r.rarity === 5) audio.sfx('pull5'); else audio.sfx('pull4');
    setTimeout(() => el.addEventListener('click', () => { el.remove(); resolve(); }), 350);
  });
}

function summary(results) {
  return new Promise((resolve) => {
    const grid = h('div', { class: 'results-grid' }, results.map((r) => h('div', { class: `res r${r.rarity}` },
      r.type === 'girl' ? svgEl(portraitSVG(r.id, { variant: 'bust', bg: true })) : h('div', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px' } }, '✦'),
      h('div', { class: 'lbl' }, r.type === 'girl' ? GIRLS[r.id].name.split(' ')[0] : `+${r.amount} Dust`))));
    const m = modal(h('div', {}, h('h2', {}, 'Results'), grid, h('div', { style: { marginTop: '12px' } }, btn('OK', () => m.close(), 'primary'))), { cls: 'center', onClose: resolve });
  });
}

function wait(ms, cancel) {
  return new Promise((res) => {
    const t0 = performance.now();
    const tick = () => { if (cancel() || performance.now() - t0 > ms) res(); else requestAnimationFrame(tick); };
    tick();
  });
}
