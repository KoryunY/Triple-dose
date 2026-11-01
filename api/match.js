// Online match API. The match state lives in rooms.state (JSON) and is advanced lazily on every request.
// Writes use a version check (optimistic concurrency) so simultaneous players can't clobber each other.
//
// GET  /api/match?code=ABC123&guest=<id>                       -> player's view (advances timers)
// POST /api/match { op:'create', guest, name, loadout }         -> new room
// POST /api/match { op:'join', code, guest, name, loadout }     -> sit at the table (or rejoin)
// POST /api/match { op:'act', code, guest, action }             -> game action
// POST /api/match { op:'leave', code, guest }                   -> leave (lobby only; mid-match you just disconnect)

import { run, query, now, send, fail, body } from './_d1.js';
import { createMatch, addPlayer, removePlayer, advance, act, viewFor, electHost } from '../shared/engine.js';

const ONLINE_MS = 12000;      // a player counts as connected if seen within this window
const TOUCH_EVERY_MS = 4000;  // throttle last_seen writes

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const code = String(req.query.code || '').toUpperCase();
      const guest = String(req.query.guest || '');
      const out = await withRoom(code, guest, () => null);
      return send(res, out.status || 200, out.body);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const b = body(req);
    const guest = String(b.guest || '');
    const [g] = await query('SELECT id, name FROM guests WHERE id = ?', [guest]);
    if (!g) return send(res, 400, { error: 'Unknown guest — reload the game' });

    if (b.op === 'create') {
      const t = now();
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const state = createMatch({ now: t });
        addPlayer(state, playerInfo(guest, b.name || g.name, b.loadout));
        const r = await run(
          'INSERT OR IGNORE INTO rooms (code, state, created_at, updated_at, version) VALUES (?, ?, ?, ?, 0)',
          [code, JSON.stringify(state), t, t]
        );
        if (!r.changes) continue;
        await run('INSERT INTO room_players (room_code, guest_id, slot, joined_at, last_seen) VALUES (?, ?, 1, ?, ?)', [code, guest, t, t]);
        return send(res, 200, { code, view: viewFor(state, guest) });
      }
      return send(res, 500, { error: 'Could not create a room, try again' });
    }

    const code = String(b.code || '').toUpperCase();

    if (b.op === 'join') {
      const out = await withRoom(code, guest, async (state) => {
        if (state.players.some((p) => p.id === guest)) return { ok: true };
        const r = addPlayer(state, playerInfo(guest, b.name || g.name, b.loadout));
        if (!r.ok) return r;
        const seat = state.players.find((p) => p.id === guest).seat + 1;
        await run(
          `INSERT INTO room_players (room_code, guest_id, slot, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(room_code, guest_id) DO UPDATE SET last_seen = excluded.last_seen`,
          [code, guest, seat, now(), now()]
        ).catch(async () => {
          // seat number clash from an old row: clear stale rows for that slot and retry
          await run('DELETE FROM room_players WHERE room_code = ? AND slot = ? AND guest_id <> ?', [code, seat, guest]);
          await run('INSERT OR REPLACE INTO room_players (room_code, guest_id, slot, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)', [code, guest, seat, now(), now()]);
        });
        return { ok: true, changed: true };
      }, { allowStranger: true });
      return send(res, out.status || 200, out.body);
    }

    if (b.op === 'act') {
      const out = await withRoom(code, guest, (state) => act(state, guest, b.action || {}, now()));
      return send(res, out.status || 200, out.body);
    }

    if (b.op === 'leave') {
      const out = await withRoom(code, guest, async (state) => {
        if (state.phase === 'lobby') removePlayer(state, guest);
        await run('DELETE FROM room_players WHERE room_code = ? AND guest_id = ?', [code, guest]);
        return { ok: true, changed: true };
      });
      return send(res, out.status || 200, { ok: true, ...out.body });
    }

    send(res, 400, { error: 'Unknown op' });
  } catch (err) {
    fail(res, err);
  }
}

function playerInfo(guest, name, loadout = {}) {
  return {
    id: guest,
    name: String(name || 'Guest').slice(0, 20),
    patron: loadout.patron || null,
    echoes: Array.isArray(loadout.echoes) ? loadout.echoes.slice(0, 3) : [],
    echoSlots: loadout.echoSlots || 1,
  };
}

/**
 * Load room -> refresh presence -> elect host -> advance timers -> apply fn -> save with version check.
 * Retries on concurrent writes.
 */
async function withRoom(code, guest, fn, opts = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [row] = await query('SELECT state, version FROM rooms WHERE code = ?', [code]);
    if (!row) return { status: 404, body: { error: 'Room not found' } };
    const state = JSON.parse(row.state);
    const t = now();

    const seats = await query('SELECT guest_id, last_seen FROM room_players WHERE room_code = ?', [code]);
    const mine = seats.find((s) => s.guest_id === guest);
    if (!mine && !opts.allowStranger && !state.players.some((p) => p.id === guest)) {
      return { status: 403, body: { error: 'You are not at this table' } };
    }
    if (mine && t - mine.last_seen > TOUCH_EVERY_MS) {
      await run('UPDATE room_players SET last_seen = ? WHERE room_code = ? AND guest_id = ?', [t, code, guest]);
      mine.last_seen = t;
    }
    const connected = new Set(seats.filter((s) => t - s.last_seen < ONLINE_MS).map((s) => s.guest_id));
    if (mine) connected.add(guest);

    let changed = electHost(state, connected);
    if (advance(state, t)) changed = true;
    const result = await fn(state);
    if (result && result.ok === false) {
      if (changed) await save(code, state, row.version); // keep timer progress even if the action failed
      return { status: 400, body: { error: result.error, view: viewFor(state, guest) } };
    }
    if (result && (result.changed || result.ok)) { // any successful action mutates state
      // actions may unlock an early phase change (e.g. everyone locked in)
      advance(state, t);
      changed = true;
    }
    if (changed) {
      const ok = await save(code, state, row.version);
      if (!ok) continue; // someone else wrote first — reload and retry
    }
    return { status: 200, body: { code, view: viewFor(state, guest), online: [...connected], serverNow: now() } };
  }
  return { status: 409, body: { error: 'The table is busy, try again' } };
}

async function save(code, state, version) {
  const r = await run(
    'UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?',
    [JSON.stringify(state), now(), code, version]
  );
  return r.changes > 0;
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
