import { query, now, send, fail, body } from './_d1.js';

// POST { id?, name?, profile? } -> creates a guest or refreshes one; optionally backs up the profile.
// GET  ?id=...                  -> the guest (with backed-up profile) and their current room code.
export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { id, name, profile } = body(req);
      const guestId = typeof id === 'string' && /^[\w-]{8,64}$/.test(id) ? id : crypto.randomUUID();
      const t = now();
      const data = profile && typeof profile === 'object' ? JSON.stringify(profile).slice(0, 60000) : null;
      await query(
        `INSERT INTO guests (id, name, data, created_at, last_seen) VALUES (?1, ?2, COALESCE(?5, '{}'), ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
           name = CASE WHEN ?6 = '' THEN guests.name ELSE excluded.name END,
           data = CASE WHEN ?5 IS NULL THEN guests.data ELSE ?5 END`,
        [guestId, String(name || `Guest-${guestId.slice(0, 4)}`).slice(0, 20), t, t, data, name || '']
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
    `SELECT p.room_code AS code FROM room_players p JOIN rooms r ON r.code = p.room_code
     WHERE p.guest_id = ? ORDER BY r.updated_at DESC LIMIT 1`,
    [id]
  );
  let profile = null;
  try { profile = JSON.parse(guest.data); } catch { /* ignore */ }
  return { guest: { id: guest.id, name: guest.name }, profile: profile && profile.v ? profile : null, room: seat?.code || null };
}
