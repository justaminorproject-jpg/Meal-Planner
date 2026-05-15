/**
 * Generic admin data store — Upstash Redis
 * Supports both Vercel KV and Upstash direct env var names
 *
 * GET  /api/data?key=mp_sponsors     — public
 * GET  /api/data?key=mp_monetization — public
 * GET  /api/data?key=mp_billing      — admin only
 * POST /api/data { key, value }      — admin only
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Content-Type": "application/json",
};

const PUBLIC_KEYS = ["mp_sponsors", "mp_monetization"];

function getKvCreds() {
  return {
    url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

async function kvGet(key) {
  const { url, token } = getKvCreds();
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (_) { return null; }
}

async function kvSet(key, value) {
  const { url, token } = getKvCreds();
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(value) }),
    });
    return res.ok;
  } catch (_) { return false; }
}

function isAdmin(req) {
  const key = req.headers["x-admin-key"];
  return key && key === process.env.ADMIN_API_KEY;
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const key = req.query?.key;
    if (!key) return res.status(400).json({ error: "Missing key param" });
    if (!PUBLIC_KEYS.includes(key) && !isAdmin(req))
      return res.status(401).json({ error: "Unauthorized" });
    const value = await kvGet(key);
    return res.status(200).json({ key, value: value ?? null });
  }

  if (req.method === "POST") {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: "Missing key" });
    const ok = await kvSet(key, value);
    return res.status(200).json({ ok, key });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
