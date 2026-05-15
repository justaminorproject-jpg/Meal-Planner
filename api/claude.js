/**
 * Vercel Serverless Proxy — Anthropic Claude with Groq fallback
 *
 * Environment variables (set in Vercel dashboard → Project Settings → Env):
 *   ANTHROPIC_API_KEY  = sk-ant-api03-...   (required)
 *   GROQ_API_KEY       = gsk_...            (optional — enables fallback)
 */

const https = require("https");

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.setTimeout(25000, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function callAnthropic(apiKey, payload) {
  const body = JSON.stringify(payload);
  const result = await httpsPost(
    "api.anthropic.com", "/v1/messages",
    { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body
  );
  const parsed = JSON.parse(result.body);
  if (result.status >= 400) throw new Error(parsed?.error?.message || `Anthropic ${result.status}`);
  return parsed;
}

function anthropicToGroqMessages(msgs) {
  return msgs.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map(b => b.text || "").join(""),
  }));
}

async function callGroq(apiKey, payload) {
  const groqPayload = {
    model: "llama-3.3-70b-versatile",
    max_tokens: Math.min(payload.max_tokens || 4096, 8000),
    temperature: 0.7,
    messages: anthropicToGroqMessages(payload.messages),
  };
  const body = JSON.stringify(groqPayload);
  const result = await httpsPost(
    "api.groq.com", "/openai/v1/chat/completions",
    { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body
  );
  const parsed = JSON.parse(result.body);
  if (result.status >= 400) throw new Error(parsed?.error?.message || `Groq ${result.status}`);
  const text = parsed.choices?.[0]?.message?.content || "";
  // Return in Anthropic format so the app works unchanged
  return {
    id: parsed.id, type: "message", role: "assistant", model: parsed.model,
    content: [{ type: "text", text }],
    stop_reason: parsed.choices?.[0]?.finish_reason || "end_turn",
    usage: { input_tokens: parsed.usage?.prompt_tokens || 0, output_tokens: parsed.usage?.completion_tokens || 0 },
    _fallback: true,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;

  if (!anthropicKey) return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY not configured" } });

  const payload = req.body;

  // Try Anthropic first
  try {
    const data = await callAnthropic(anthropicKey, payload);
    console.log("✅ Anthropic success");
    return res.status(200).json(data);
  } catch (anthropicErr) {
    console.warn("⚠️ Anthropic failed:", anthropicErr.message);

    if (!groqKey) {
      return res.status(503).json({ error: { message: `Anthropic unavailable: ${anthropicErr.message}. No GROQ_API_KEY for fallback.` } });
    }

    // Fallback to Groq
    try {
      const data = await callGroq(groqKey, payload);
      console.log("✅ Groq fallback success");
      return res.status(200).json(data);
    } catch (groqErr) {
      console.error("❌ Both failed:", groqErr.message);
      return res.status(503).json({ error: { message: `Both providers failed. Anthropic: ${anthropicErr.message}. Groq: ${groqErr.message}` } });
    }
  }
};
