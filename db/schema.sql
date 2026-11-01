-- Triple Dose — Cloudflare D1 schema (also used by the local SQLite fallback)
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS room_players (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
  joined_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_code, guest_id),
  UNIQUE (room_code, slot)
);
CREATE INDEX IF NOT EXISTS idx_room_players_guest ON room_players(guest_id);
