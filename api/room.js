import { query, now, send, fail } from './_d1.js';

const MAX_PLAYERS = 3;

// POST { action: 'create' | 'join' | 'leave', guestId, code? }
// GET  ?code=...  -> room with its players
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const room = await loadRoom(String(req.query.code || '').toUpperCase());
      return room ? send(res, 200, room) : send(res, 404, { error: 'Room not found' });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const { action, guestId } = req.body || {};
    const code = String(req.body?.code || '').toUpperCase();
    const [guest] = await query('SELECT id FROM guests WHERE id = ?', [guestId || '']);
    if (!guest) return send(res, 400, { error: 'Join as a guest first' });

    if (action === 'create') {
      const newCode = randomCode();
      const t = now();
      await query('INSERT INTO rooms (code, state, created_at, updated_at) VALUES (?, ?, ?, ?)', [newCode, '{}', t, t]);
      await query('INSERT INTO room_players (room_code, guest_id, slot, joined_at) VALUES (?, ?, 1, ?)', [newCode, guestId, t]);
      return send(res, 200, await loadRoom(newCode));
    }

    if (action === 'join') {
      const room = await loadRoom(code);
      if (!room) return send(res, 404, { error: 'Room not found' });
      if (room.players.some((p) => p.id === guestId)) return send(res, 200, room); // rejoin
      // Take the lowest free seat; the UNIQUE(room_code, slot) constraint stops two players grabbing the same one.
      for (let attempt = 0; attempt < 3; attempt++) {
        const taken = new Set((await loadRoom(code)).players.map((p) => p.slot));
        const slot = [1, 2, 3].find((s) => !taken.has(s));
        if (!slot) return send(res, 409, { error: `Room is full (${MAX_PLAYERS} players)` });
        try {
          await query('INSERT INTO room_players (room_code, guest_id, slot, joined_at) VALUES (?, ?, ?, ?)', [code, guestId, slot, now()]);
          return send(res, 200, await loadRoom(code));
        } catch (err) {
          if (!/UNIQUE/i.test(err.message)) throw err;
        }
      }
      return send(res, 409, { error: 'Seat taken, try again' });
    }

    if (action === 'leave') {
      await query('DELETE FROM room_players WHERE room_code = ? AND guest_id = ?', [code, guestId]);
      return send(res, 200, { ok: true });
    }

    send(res, 400, { error: 'Unknown action' });
  } catch (err) {
    fail(res, err);
  }
}

async function loadRoom(code) {
  const [room] = await query('SELECT code, state FROM rooms WHERE code = ?', [code]);
  if (!room) return null;
  const players = await query(
    `SELECT g.id, g.name, p.slot FROM room_players p JOIN guests g ON g.id = p.guest_id
     WHERE p.room_code = ? ORDER BY p.slot`,
    [code]
  );
  return { code: room.code, state: JSON.parse(room.state), players };
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
