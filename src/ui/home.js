// Home hub: patron splash, fame, currencies, and the main menu.

import { h, btn, svgEl, toast, modal } from './dom.js';
import { getProfile, rank, playerName, setPlayerName, onProfile, ensureGuest, getGuest } from '../core/profile.js';
import { GIRLS } from '../../shared/data.js';
import { portraitSVG } from '../art/portrait.js';
import { logoSVG } from '../art/icons.js';
import { patronDesc } from '../../shared/build.js';
import { audio } from '../audio/audio.js';

export function openHome(nav) {
  const ui = document.getElementById('ui');
  const root = h('div', { class: 'screen home' });
  ui.append(root);
  audio.music('menu');

  function render() {
    const p = getProfile();
    const r = rank();
    const girl = GIRLS[p.patron];
    root.innerHTML = '';
    const pct = r.next ? Math.min(100, ((p.fame - r.min) / (r.next.min - r.min)) * 100) : 100;
    root.append(
      h('div', { class: 'topbar' },
        h('span', { class: 'chip', title: 'Tickets — spend on banners' }, '🎟 ', String(p.tickets)),
        h('span', { class: 'chip', title: 'Dust — upgrade Echoes' }, '✦ ', String(p.dust)),
        h('div', { style: { flex: 1 } }),
        btn(audio.muted ? '🔇' : '🔊', () => { audio.setMuted(!audio.muted); render(); }, 'icon ghost'),
        btn('⚙', settings, 'icon ghost')),
      svgEl(logoSVG(), 'logo'),
      h('div', { class: 'fame' },
        h('div', { class: 'row small' }, h('b', {}, `${r.name}`), h('span', { class: 'muted grow' }, ` · ${p.fame} Fame`), h('span', { class: 'muted' }, r.next ? `${r.next.name} at ${r.next.min}` : 'Max rank')),
        h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } }))),
      h('div', { class: 'hero' },
        svgEl(portraitSVG(p.patron, { variant: 'splash', bg: false })),
        h('div', { class: 'patron-tag', onClick: () => nav('girls') },
          h('b', {}, girl?.name), h('span', { class: 'small muted' }, `${girl?.passive.name}: ${patronDesc(p.patron, p.girls[p.patron]?.bond || 0)}`))),
      h('div', { class: 'menu' },
        btn('Play vs bots', () => nav('solo'), 'primary wide'),
        btn('Online table', online, 'cyan'),
        btn('Expedition', () => nav('expedition'), ''),
        btn('Banners', () => nav('gacha'), 'gold'),
        btn(`Echoes (${p.echoes.length})`, () => nav('echoes'), ''),
        btn('Girls', () => nav('girls'), 'ghost'),
        btn('How to play', howTo, 'ghost')));
  }

  async function online() {
    const g = getGuest();
    let status = g?.online ? { online: true } : await ensureGuest();
    if (!status.online) {
      toast('Online play is offline right now — try solo, or retry soon.', 'bad');
      return;
    }
    let codeInput;
    const m = modal(h('div', { class: 'col' },
      h('h2', {}, 'Online table'),
      h('p', { class: 'muted small' }, 'Up to 3 players. The first to sit is the host; if they drop, the next seat takes over. Empty seats can be filled with bots.'),
      lastRoom() ? btn(`Rejoin ${lastRoom()}`, () => { m.close(); nav('join', lastRoom()); }, 'gold') : null,
      btn('Create a table', () => { m.close(); nav('create'); }, 'primary'),
      h('div', { class: 'row' },
        codeInput = h('input', { class: 'grow', placeholder: 'ROOM CODE', maxlength: '6', style: { padding: '12px', borderRadius: '12px', border: '1px solid var(--line)', background: '#0f0b18', color: 'inherit', textTransform: 'uppercase', letterSpacing: '4px', fontWeight: '800', minWidth: 0 } }),
        btn('Join', () => { const c = codeInput.value.trim(); if (c.length < 4) return toast('Enter a room code'); m.close(); nav('join', c); }, 'cyan'))));
  }

  function settings() {
    let input;
    const m = modal(h('div', { class: 'col' },
      h('h2', {}, 'Settings'),
      h('label', { class: 'small muted' }, 'Your name at the table'),
      input = h('input', { value: playerName(), maxlength: '16', style: { padding: '12px', borderRadius: '12px', border: '1px solid var(--line)', background: '#0f0b18', color: 'inherit' } }),
      btn('Save', () => { setPlayerName(input.value); toast('Saved', 'good'); m.close(); render(); }, 'primary'),
      h('p', { class: 'small muted' }, 'Progress is saved on this device and backed up to the server when online play is available.')));
  }

  const off = onProfile(render);
  render();
  return { close() { off(); root.remove(); } };
}

function lastRoom() {
  try { return localStorage.getItem('tripledose.lastRoom') || ''; } catch { return ''; }
}

export function howTo() {
  modal(h('div', { class: 'col', style: { gap: '6px' } },
    h('h2', {}, 'How to play'),
    h('p', {}, h('b', {}, '1. Dose Roll. '), 'Everyone rolls a Smoke die (Ash Stick, Cloud Pipe, rare Herb) and a Drink die (Water, Fizz, rare Moonshine). Common faces give steady buffs; rare faces roll on the Haze or Last Call tables — huge swings, sometimes backfires. Two rares = DOUBLE DOSE.'),
    h('p', {}, h('b', {}, '2. Trade. '), 'Offer a card to another player for any card of a suit you want. Optional, 20 seconds.'),
    h('p', {}, h('b', {}, '3. Play. '), 'Everyone secretly picks 1–3 cards at the same time. Suits set the weapon and stats; Pairs, Triads, Spectrums and Runs add combos. Played cards are spent, so pace yourself.'),
    h('p', {}, h('b', {}, '4. Summon & Battle. '), 'Your cards become a fighter whose look shows its buffs (head = crit, bulk = HP, legs = speed, aura = your dose). Fighters auto-battle in the arena.'),
    h('p', {}, h('b', {}, '5. Echoes. '), 'The round winner\'s fighter becomes an Echo you keep. Send Echoes into later battles (60% power, once per match each). Fame rank unlocks more slots.'),
    h('p', {}, h('b', {}, 'Hidden personas. '), 'Some cards secretly hold a King, Queen, Assassin, Phoenix… They work even while hidden. Reveal one by playing it with a same-suit card or winning with it. Kings and Queens issue Edicts for the next round.'),
    h('p', {}, h('b', {}, 'Win. '), 'First to 3 battle wins takes the match. Earn Tickets for the Banners and Fame for rank.')), { cls: 'center' });
}
