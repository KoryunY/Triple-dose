const KEY = 'tripledose.session';
const $ = (id) => document.getElementById(id);

let session = load(); // cached locally: { guest, room }
let poll;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch {}
}

async function api(path, body) {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function render() {
  const { guest, room } = session;
  $('guestInfo').textContent = guest ? `You are ${guest.name} (${guest.id.slice(0, 8)}…)` : 'Not joined yet';
  $('roomBox').hidden = !guest;
  if (!room) { $('roomInfo').innerHTML = ''; return; }
  const seats = [1, 2, 3].map((s) => {
    const p = room.players?.find((x) => x.slot === s);
    const me = p && p.id === guest?.id ? ' (you)' : '';
    return `<div class="seat"><span>Seat ${s}</span><span>${p ? escape(p.name) + me : '<span class="muted">empty</span>'}</span></div>`;
  }).join('');
  $('roomInfo').innerHTML = `<p>Room <code>${room.code}</code> · ${room.players?.length || 0}/3</p>${seats}`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function run(fn) {
  $('msg').textContent = '';
  try { await fn(); } catch (e) { $('msg').textContent = e.message; }
  save(); render();
}

async function refreshRoom() {
  if (!session.room) return;
  session.room = await api(`/api/room?code=${session.room.code}`);
  save(); render();
}

function startPolling() {
  clearInterval(poll);
  poll = setInterval(() => refreshRoom().catch(() => {}), 3000);
}

$('joinGuest').onclick = () => run(async () => {
  const r = await api('/api/guest', { id: session.guest?.id, name: $('name').value.trim() });
  session.guest = r.guest;
  if (r.room) { session.room = await api(`/api/room?code=${r.room.code}`); startPolling(); }
});

$('create').onclick = () => run(async () => {
  session.room = await api('/api/room', { action: 'create', guestId: session.guest.id });
  startPolling();
});

$('join').onclick = () => run(async () => {
  session.room = await api('/api/room', { action: 'join', guestId: session.guest.id, code: $('code').value.trim() });
  startPolling();
});

$('reset').onclick = () => run(async () => {
  if (session.room && session.guest) {
    await api('/api/room', { action: 'leave', guestId: session.guest.id, code: session.room.code }).catch(() => {});
  }
  clearInterval(poll);
  session = {};
});

// Rejoin: show cached data instantly, then confirm with the server.
render();
if (session.guest) {
  run(async () => {
    const r = await api(`/api/guest?id=${session.guest.id}`);
    session.guest = r.guest;
    session.room = r.room ? await api(`/api/room?code=${r.room.code}`) : null;
    if (session.room) startPolling();
  });
}
