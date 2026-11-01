// Minimal client for Cloudflare D1 over the REST API.
// Needs env vars: CF_ACCOUNT_ID, CF_API_TOKEN (D1 edit), CF_D1_DATABASE_ID.

const DB_ID = process.env.CF_D1_DATABASE_ID || '3686f74f-ca3c-43ef-aa4c-af9fa275eb7b';

export async function query(sql, params = []) {
  const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw Object.assign(new Error('Database not configured: set CF_ACCOUNT_ID and CF_API_TOKEN in Vercel'), { status: 500 });
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${DB_ID}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params: params.map(String) }),
    }
  );
  const body = await res.json();
  if (!body.success) {
    const msg = body.errors?.map((e) => e.message).join('; ') || `D1 error ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502, d1: true });
  }
  return body.result[0].results;
}

export const now = () => Date.now();

export function send(res, status, data) {
  res.status(status).json(data);
}

export function fail(res, err) {
  console.error(err);
  send(res, err.status || 500, { error: err.message });
}
