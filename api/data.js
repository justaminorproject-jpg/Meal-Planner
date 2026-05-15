/**
 * Generic admin data store — Vercel KV
 * Handles sponsors, billing, and monetization settings
 *
 * GET  /api/data?key=sponsors     — public (sponsors visible to all)
 * GET  /api/data?key=monetization — public (affiliate/ad config for all visitors)
 * GET  /api/data?key=billing      — admin only
 * POST /api/data                  — admin only { key, value }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Content-Type": "application/json",
};

// Public keys anyone can read — admin keys require X-Admin-Key header
const PUBLIC_KEYS = ["mp_sponsors", "mp_monetization"];

async function kvGet(key) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;
  try {
    const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (_) { return null; }
}

async function kvSet(key, value) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return false;
  try {
    const res = await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
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

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const key = req.query?.key;
    if (!key) return res.status(400).json({ error: "Missing key param" });

    // Non-public keys require admin auth
    if (!PUBLIC_KEYS.includes(key) && !isAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const value = await kvGet(key);
    return res.status(200).json({ key, value: value ?? null });
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: "Missing key" });

    const ok = await kvSet(key, value);
    return res.status(200).json({ ok, key });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
