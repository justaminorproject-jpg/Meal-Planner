/**
 * Vercel Serverless Function — Sponsor CRUD via Upstash Redis
 * Supports both Vercel KV env vars and Upstash direct env vars
 *
 * Environment variables (auto-added when you connect Upstash):
 *   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
 *   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
 *   ADMIN_API_KEY — your secret admin key
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Content-Type": "application/json",
};

function getKvCreds() {
  return {
    url:   process.env.UPSTASH_REDIS_REST_KV_REST_API_URL
        || process.env.KV_REST_API_URL
        || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
        || process.env.KV_REST_API_TOKEN
        || process.env.UPSTASH_REDIS_REST_TOKEN,
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

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const sponsors = await kvGet("mp_sponsors") || [];
    return res.status(200).json({ sponsors });
  }

  if (req.method === "POST") {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY)
      return res.status(401).json({ error: "Unauthorized" });
    const { sponsors } = req.body;
    if (!Array.isArray(sponsors))
      return res.status(400).json({ error: "sponsors must be an array" });
    await kvSet("mp_sponsors", sponsors);
    return res.status(200).json({ ok: true, count: sponsors.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
