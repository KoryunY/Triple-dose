import { query, now, send, fail } from './_d1.js';

// POST { id?, name? } -> creates a guest, or refreshes an existing one.
// GET  ?id=...        -> returns the guest plus their current room (for rejoin).
export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { id, name } = req.body || {};
      const guestId = typeof id === 'string' && /^[\w-]{8,64}$/.test(id) ? id : crypto.randomUUID();
      const t = now();
      await query(
        `INSERT INTO guests (id, name, data, created_at, last_seen) VALUES (?, ?, '{}', ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
           name = CASE WHEN ?5 = '' THEN guests.name ELSE excluded.name END`,
        [guestId, name || `Guest-${guestId.slice(0, 4)}`, t, t, name || '']
      );
      return send(res, 200, await load(guestId));
    }
    if (req.method === 'GET') {
      const data = await load(String(req.query.id || ''));
      return data ? send(res, 200, data) : send(res, 404, { error: 'Unknown guest' });
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    fail(res, err);
  }
}

async function load(id) {
  const [guest] = await query('SELECT id, name, data FROM guests WHERE id = ?', [id]);
  if (!guest) return null;
  const [seat] = await query(
    `SELECT r.code, r.state, p.slot FROM room_players p JOIN rooms r ON r.code = p.room_code
     WHERE p.guest_id = ? ORDER BY p.joined_at DESC LIMIT 1`,
    [id]
  );
  return {
    guest: { ...guest, data: JSON.parse(guest.data) },
    room: seat ? { code: seat.code, slot: seat.slot, state: JSON.parse(seat.state) } : null,
  };
}
