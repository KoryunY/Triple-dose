// Triple Dose — app bootstrap and screen router.

import './style.css';
import { initStage, setView } from './three/stage.js';
import { createTableView } from './three/table.js';
import { audio } from './audio/audio.js';
import { ensureGuest, getProfile, playerName, backupNow } from './core/profile.js';
import { LocalSession, createOnline, joinOnline } from './core/session.js';
import { openHome } from './ui/home.js';
import { openMatch } from './ui/match.js';
import { openGacha } from './ui/gacha.js';
import { openGirls } from './ui/girls.js';
import { openEchoes } from './ui/echoes.js';
import { openExpedition } from './ui/expedition.js';
import { toast } from './ui/dom.js';

initStage(document.getElementById('stage'));

// A calm table scene sits behind the menus.
const menuTable = createTableView();
function showMenuBackdrop() { setView(menuTable); }
showMenuBackdrop();

// Unlock audio on the first touch (mobile browsers require a gesture).
const unlock = () => { audio.unlock(); window.removeEventListener('pointerdown', unlock); };
window.addEventListener('pointerdown', unlock);

let current = null;
let net = { online: false, room: null };

async function nav(screen, arg) {
  current?.close?.();
  current = null;
  try {
    if (screen === 'home') { showMenuBackdrop(); current = openHome(nav); }
    else if (screen === 'solo') {
      const speed = Number(new URLSearchParams(location.search).get('speed')) || 1;
      const s = new LocalSession({ bots: 2, speed: Math.min(8, Math.max(1, speed)) });
      current = { close: () => m.exit() };
      const m = openMatch(s, { onExit: () => { current = null; nav('home'); } });
    } else if (screen === 'create' || screen === 'join') {
      toast(screen === 'create' ? 'Opening a table…' : 'Joining…');
      const s = screen === 'create' ? await createOnline() : await joinOnline(arg);
      history.replaceState(null, '', `/?room=${s.code}`);
      try { localStorage.setItem('tripledose.lastRoom', s.code); } catch { /* ignore */ }
      const m = openMatch(s, { onExit: () => { current = null; history.replaceState(null, '', '/'); nav('home'); } });
      current = { close: () => m.exit() };
    } else if (screen === 'gacha') { showMenuBackdrop(); current = openGacha(nav); }
    else if (screen === 'girls') { showMenuBackdrop(); current = openGirls(nav); }
    else if (screen === 'echoes') { showMenuBackdrop(); current = openEchoes(nav); }
    else if (screen === 'expedition') { current = openExpedition(nav); }
  } catch (e) {
    console.error(e);
    toast(e.message || 'Something went wrong', 'bad');
    if (screen !== 'home') nav('home');
  }
}

async function boot() {
  getProfile();
  nav('home');
  document.getElementById('boot').style.opacity = '0';
  setTimeout(() => document.getElementById('boot')?.remove(), 450);
  net = await ensureGuest();
  if (net.online) backupNow();
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    if (!net.online) toast('Online play is not available right now', 'bad');
    else nav('join', room);
  } else if (net.room && net.online) {
    // offer to jump back into a running table
    try { localStorage.setItem('tripledose.lastRoom', net.room); } catch { /* ignore */ }
    toast(`You have an open table (${net.room}) — Online table → Rejoin.`);
  }
}

boot();
window.addEventListener('pagehide', () => backupNow());
export { playerName };
