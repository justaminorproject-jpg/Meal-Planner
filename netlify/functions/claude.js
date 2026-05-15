/**
 * Netlify Serverless Proxy — Anthropic Claude with Groq fallback
 *
 * Environment variables (set in Netlify dashboard → Site settings → Env vars):
 *   ANTHROPIC_API_KEY  = sk-ant-api03-...   (required)
 *   GROQ_API_KEY       = gsk_...            (optional — enables fallback)
 */

const https = require("https");

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Anthropic call ────────────────────────────────────────────────────────────

async function callAnthropic(apiKey, payload) {
  const body = JSON.stringify(payload);
  const result = await httpsPost(
    "api.anthropic.com",
    "/v1/messages",
    {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body
  );
  const parsed = JSON.parse(result.body);
  if (result.status >= 400) throw new Error(parsed?.error?.message || `Anthropic ${result.status}`);
  return { source: "anthropic", data: parsed };
}

// ── Groq fallback call ────────────────────────────────────────────────────────
// Groq uses OpenAI-compatible format. No web_search tool, but very fast & free.

function anthropicToGroqMessages(anthropicMessages) {
  return anthropicMessages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map(b => b.text || "").join(""),
  }));
}

async function callGroq(apiKey, payload) {
  const groqPayload = {
    model: "llama-3.3-70b-versatile",   // Best free Groq model
    max_tokens: Math.min(payload.max_tokens || 4096, 8000),
    temperature: 0.7,
    messages: anthropicToGroqMessages(payload.messages),
  };

  const body = JSON.stringify(groqPayload);
  const result = await httpsPost(
    "api.groq.com",
    "/openai/v1/chat/completions",
    {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body
  );

  const parsed = JSON.parse(result.body);
  if (result.status >= 400) throw new Error(parsed?.error?.message || `Groq ${result.status}`);

  // Convert OpenAI response format → Anthropic response format so the app works unchanged
  const text = parsed.choices?.[0]?.message?.content || "";
  return {
    source: "groq",
    data: {
      id: parsed.id,
      type: "message",
      role: "assistant",
      model: parsed.model,
      content: [{ type: "text", text }],
      stop_reason: parsed.choices?.[0]?.finish_reason || "end_turn",
      usage: {
        input_tokens: parsed.usage?.prompt_tokens || 0,
        output_tokens: parsed.usage?.completion_tokens || 0,
      },
      _fallback: true,   // flag so client knows it used Groq
    },
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",   // lock to your domain in production
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;

  if (!anthropicKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: { message: "ANTHROPIC_API_KEY not configured" } }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: { message: "Invalid JSON body" } }) }; }

  // ── Try Anthropic ─────────────────────────────────────────────────────────
  try {
    const result = await callAnthropic(anthropicKey, payload);
    console.log("✅ Anthropic success");
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result.data) };
  } catch (anthropicErr) {
    console.warn("⚠️ Anthropic failed:", anthropicErr.message);

    // ── Fallback to Groq ──────────────────────────────────────────────────
    if (!groqKey) {
      return {
        statusCode: 503,
        headers: CORS,
        body: JSON.stringify({ error: { message: `Anthropic unavailable: ${anthropicErr.message}. No GROQ_API_KEY configured for fallback.` } }),
      };
    }

    try {
      const result = await callGroq(groqKey, payload);
      console.log("✅ Groq fallback success");
      return { statusCode: 200, headers: CORS, body: JSON.stringify(result.data) };
    } catch (groqErr) {
      console.error("❌ Groq also failed:", groqErr.message);
      return {
        statusCode: 503,
        headers: CORS,
        body: JSON.stringify({
          error: { message: `Both AI providers failed. Anthropic: ${anthropicErr.message}. Groq: ${groqErr.message}` }
        }),
      };
    }
  }
};
