// Player profile: tickets, dust, fame, girls, echoes, pity. Saved locally, backed up to the server when online.

import { newProfile, GIRLS, GACHA, ECHO, fameRank, BANNERS } from '../../shared/data.js';

const KEY = 'tripledose.profile';
const GUEST_KEY = 'tripledose.guest';
let profile = load();
const listeners = new Set();

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && p.v === 1) return { ...newProfile(), ...p, pity: { ...newProfile().pity, ...p.pity }, stats: { ...newProfile().stats, ...p.stats } };
  } catch { /* ignore */ }
  return newProfile();
}

export function getProfile() { return profile; }

export function saveProfile() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* storage full or blocked */ }
  for (const fn of listeners) fn(profile);
  scheduleBackup();
}

export function onProfile(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function replaceProfile(p) { profile = { ...newProfile(), ...p }; saveProfile(); }

// ---------------------------------------------------------------- guest identity

export function getGuest() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || null; } catch { return null; }
}
export function setGuest(g) {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)); } catch { /* ignore */ }
}
export function playerName() {
  return getGuest()?.name || profile.name || 'Guest';
}
export function setPlayerName(name) {
  profile.name = String(name || '').trim().slice(0, 16) || 'Guest';
  const g = getGuest();
  if (g) setGuest({ ...g, name: profile.name });
  saveProfile();
}

let backupTimer = null;
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(backupNow, 4000);
}
export async function backupNow() {
  const g = getGuest();
  if (!g || !g.online) return;
  try {
    await fetch('/api/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, name: playerName(), profile }) });
  } catch { /* offline is fine */ }
}

/** Register / refresh the guest on the server. Returns { online, room } */
export async function ensureGuest() {
  let g = getGuest();
  try {
    const res = await fetch('/api/guest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g?.id, name: profile.name || g?.name || '' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'offline');
    g = { id: data.guest.id, name: profile.name || data.guest.name, online: true };
    setGuest(g);
    // restore a backed-up profile on a fresh device
    if (data.profile && (profile.stats.matches === 0 && !profile.pullHistory.length) && (data.profile.stats?.matches || data.profile.pullHistory?.length)) {
      replaceProfile(data.profile);
    }
    return { online: true, room: data.room };
  } catch (e) {
    if (!g) { g = { id: `local-${Math.random().toString(36).slice(2, 10)}`, name: profile.name || 'Guest', online: false }; setGuest(g); }
    else setGuest({ ...g, online: false });
    return { online: false, room: null, error: e.message };
  }
}

// ---------------------------------------------------------------- derived

export function rank() { return fameRank(profile.fame); }
export function echoSlots() { return rank().echoSlots; }
export function patronRef() { return { id: profile.patron, bond: profile.girls[profile.patron]?.bond || 0 }; }
export function equippedEchoes() {
  const slots = echoSlots();
  return profile.equipped.map((id) => profile.echoes.find((e) => e.id === id)).filter(Boolean).slice(0, slots);
}
export function loadout() {
  return { patron: patronRef(), echoes: equippedEchoes(), echoSlots: echoSlots() };
}

// ---------------------------------------------------------------- rewards

export function claimMatch(matchKey, result, earnedEchoes = []) {
  profile.claimed = profile.claimed || [];
  if (profile.claimed.includes(matchKey)) return null;
  profile.claimed.push(matchKey);
  if (profile.claimed.length > 60) profile.claimed.splice(0, profile.claimed.length - 60);
  const before = rank();
  profile.tickets += result.tickets;
  profile.fame += result.fame;
  profile.stats.matches += 1;
  if (result.place === 1) profile.stats.wins += 1;
  profile.stats.roundWins += result.wins || 0;
  const added = addEchoes(earnedEchoes);
  saveProfile();
  const after = rank();
  return { ...result, echoes: added, rankUp: after.index > before.index ? after : null };
}

export function addEchoes(list) {
  const added = [];
  for (const e of list) {
    if (profile.echoes.some((x) => x.id === e.id)) continue;
    profile.echoes.unshift({ ...e, level: e.level || 0 });
    added.push(e);
    // auto-equip into a free slot
    if (profile.equipped.length < echoSlots()) profile.equipped.push(e.id);
  }
  if (profile.echoes.length > ECHO.maxStored) {
    const extra = profile.echoes.splice(ECHO.maxStored);
    profile.dust += extra.length * 10;
    profile.equipped = profile.equipped.filter((id) => profile.echoes.some((e) => e.id === id));
  }
  return added;
}

// ---------------------------------------------------------------- echoes management

export function toggleEquip(id) {
  const i = profile.equipped.indexOf(id);
  if (i >= 0) profile.equipped.splice(i, 1);
  else {
    if (profile.equipped.length >= echoSlots()) return { ok: false, error: `Only ${echoSlots()} Echo slot${echoSlots() > 1 ? 's' : ''} at your Fame rank` };
    profile.equipped.push(id);
  }
  saveProfile();
  return { ok: true };
}

export function levelUpEcho(id) {
  const e = profile.echoes.find((x) => x.id === id);
  if (!e) return { ok: false, error: 'Echo not found' };
  if ((e.level || 0) >= ECHO.maxLevel) return { ok: false, error: 'Max level' };
  const cost = ECHO.levelCost(e.level || 0);
  if (profile.dust < cost) return { ok: false, error: `Need ${cost} Dust` };
  profile.dust -= cost;
  e.level = (e.level || 0) + 1;
  saveProfile();
  return { ok: true };
}

export function releaseEcho(id) {
  const i = profile.echoes.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false };
  const [e] = profile.echoes.splice(i, 1);
  profile.equipped = profile.equipped.filter((x) => x !== id);
  profile.dust += 15 + (e.level || 0) * 10;
  saveProfile();
  return { ok: true, dust: 15 + (e.level || 0) * 10 };
}

export function renameEcho(id, name) {
  const e = profile.echoes.find((x) => x.id === id);
  if (e) { e.name = String(name).slice(0, 18); saveProfile(); }
}

export function setPatron(id) {
  if (!profile.girls[id]) return;
  profile.patron = id;
  saveProfile();
}

export function ownsGirl(id) { return !!profile.girls[id]; }
export const allBanners = BANNERS;
export const girlInfo = (id) => GIRLS[id];
export { GACHA };
