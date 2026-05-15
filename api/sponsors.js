/**
 * Vercel Serverless Function — Sponsor CRUD via Vercel KV
 *
 * Environment variables (set in Vercel dashboard):
 *   KV_REST_API_URL    — auto-added when you connect a KV store
 *   KV_REST_API_TOKEN  — auto-added when you connect a KV store
 *   ADMIN_API_KEY      — your secret admin key (you set this manually)
 *
 * Routes:
 *   GET  /api/sponsors         — returns all sponsors (public)
 *   POST /api/sponsors         — saves full sponsors array (admin only)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Content-Type": "application/json",
};

// ── Vercel KV helpers (uses Upstash Redis REST API) ──────────────────────────
async function kvGet(key) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;
  try {
    const res = await fetch(`${KV_REST_API_URL}/get/${key}`, {
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
    const res = await fetch(`${KV_REST_API_URL}/set/${key}`, {
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

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET — public, returns sponsors array ──────────────────────────────────
  if (req.method === "GET") {
    const sponsors = await kvGet("mp_sponsors") || [];
    return res.status(200).json({ sponsors });
  }

  // ── POST — admin only, saves full sponsors array ──────────────────────────
  if (req.method === "POST") {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { sponsors } = req.body;
    if (!Array.isArray(sponsors)) {
      return res.status(400).json({ error: "sponsors must be an array" });
    }
    const ok = await kvSet("mp_sponsors", sponsors);
    if (!ok) {
      // KV not configured — return success anyway so app still works locally
      console.warn("KV not configured — sponsors not persisted");
    }
    return res.status(200).json({ ok: true, count: sponsors.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
