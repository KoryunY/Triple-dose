// Database access for the API.
// Production: Cloudflare D1 over its REST API (env: CF_ACCOUNT_ID, CF_API_TOKEN, optional CF_D1_DATABASE_ID).
// Local dev/tests: set TD_LOCAL_DB=/path/to/file.sqlite to use Node's built-in SQLite with the same schema.

import { readFileSync } from 'node:fs';

const DB_ID = process.env.CF_D1_DATABASE_ID || '3686f74f-ca3c-43ef-aa4c-af9fa275eb7b';
let local = null;

async function localDb() {
  if (local) return local;
  const { DatabaseSync } = await import('node:sqlite');
  local = new DatabaseSync(process.env.TD_LOCAL_DB);
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  local.exec(schema);
  return local;
}

export function dbConfigured() {
  return !!((process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) || process.env.TD_LOCAL_DB);
}

/** Run one SQL statement. Returns { rows, changes }. */
export async function run(sql, params = []) {
  const { CF_ACCOUNT_ID, CF_API_TOKEN, TD_LOCAL_DB } = process.env;
  if (!(CF_ACCOUNT_ID && CF_API_TOKEN) && TD_LOCAL_DB) {
    const db = await localDb();
    const stmt = db.prepare(sql);
    const args = params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
    if (/^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql)) return { rows: stmt.all(...args), changes: 0 };
    const r = stmt.run(...args);
    return { rows: [], changes: Number(r.changes) };
  }
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw Object.assign(new Error('Online play is not set up yet (database keys missing).'), { status: 503, code: 'NO_DB' });
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${DB_ID}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    const msg = body.errors?.map((e) => e.message).join('; ') || `Database error ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }
  const r = body.result[0];
  return { rows: r.results || [], changes: r.meta?.changes ?? 0 };
}

export async function query(sql, params = []) {
  return (await run(sql, params)).rows;
}

export const now = () => Date.now();

export function send(res, status, data) {
  res.setHeader?.('Cache-Control', 'no-store');
  res.status(status).json(data);
}

export function fail(res, err) {
  if (!err.status || err.status >= 500) console.error(err);
  send(res, err.status || 500, { error: err.message, code: err.code });
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
