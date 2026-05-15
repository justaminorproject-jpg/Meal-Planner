# 🍳 AI Meal Planner — Deployment Guide

Your API key lives on the server. Users never see it. No sign-up required for your users.

---

## 📁 Folder Structure

```
meal-planner-deploy/
├── index.html                  ← The app (PWA)
├── netlify/
│   └── functions/
│       └── claude.js           ← Netlify proxy function
├── api/
│   └── claude.js               ← Vercel proxy function
├── netlify.toml                ← Netlify config
├── vercel.json                 ← Vercel config
├── .env.example                ← Environment variable template
└── README.md                   ← This file
```

---

## 🚀 Deploy on Netlify (Recommended — free)

**Step 1 — Create account**
Go to [netlify.com](https://netlify.com) and sign up for free.

**Step 2 — Upload your site**
- Click **"Add new site"** → **"Deploy manually"**
- Drag the entire `meal-planner-deploy` folder into the upload box
- Netlify gives you a live URL instantly (e.g. `https://your-app.netlify.app`)

**Step 3 — Set your API key**
- In Netlify dashboard → **Site settings** → **Environment variables**
- Click **"Add a variable"**
- Key: `ANTHROPIC_API_KEY`
- Value: your key from [console.anthropic.com](https://console.anthropic.com)
- Click **Save**

**Step 4 — Redeploy**
- Go to **Deploys** tab → click **"Trigger deploy"** → **"Deploy site"**
- Done! Your site is live with the proxy active.

**Step 5 — Custom domain (optional)**
- In Netlify → **Domain management** → **Add custom domain**
- Follow the DNS instructions for your registrar

---

## 🚀 Deploy on Vercel (Alternative — also free)

**Step 1 — Create account**
Go to [vercel.com](https://vercel.com) and sign up.

**Step 2 — Upload**
- Click **"Add New Project"** → **"Upload"** (or connect GitHub)
- Upload the `meal-planner-deploy` folder

**Step 3 — Set your API key**
- During setup or in **Project Settings** → **Environment Variables**
- Add: `ANTHROPIC_API_KEY` = your key
- Set for: Production, Preview, Development

**Step 4 — Deploy**
- Click **Deploy** — Vercel builds and deploys automatically

---

## 🔒 Security Tips

| What | Why |
|------|-----|
| Never put your API key in `index.html` | It would be visible to anyone viewing source |
| Lock CORS to your domain | Edit the `Access-Control-Allow-Origin` header in both proxy files from `"*"` to `"https://yourdomain.com"` |
| Monitor usage | Check [console.anthropic.com](https://console.anthropic.com) → Usage to watch API spend |
| Set spending limits | In Anthropic console → Billing → set a monthly limit so you can't be surprised |

---

## 💡 How the Proxy Works

```
User's browser                Your Server              Anthropic
     │                            │                        │
     │  POST /api/claude          │                        │
     │  { model, messages... }    │                        │
     │ ─────────────────────────► │                        │
     │                            │  POST /v1/messages     │
     │                            │  x-api-key: sk-ant-... │
     │                            │ ──────────────────────►│
     │                            │                        │
     │                            │  { content: [...] }    │
     │                            │ ◄──────────────────────│
     │  { content: [...] }        │                        │
     │ ◄───────────────────────── │                        │
```

Your API key only ever travels between **your server** and **Anthropic**. Users hit `/api/claude` and get the response — they never see the key.

---

## 💰 Monetization Setup

Once deployed, go to **Admin → 📈 Monetization** to configure:
- **Google AdSense** — paste your publisher ID and ad slot IDs
- **Amazon Associates** — paste your tracking tag (`yourtag-20`)
- **Instacart Affiliate** — paste your affiliate ID

These settings save to the user's browser localStorage and apply on next load.

---

## 📬 Support

Questions? Email: [legal@aimeaplanner.com](mailto:legal@aimeaplanner.com)

---

## ⚡ Groq Fallback Setup

If Anthropic is down, rate-limited, or returns an error, requests automatically
retry on **Groq** (free, extremely fast — uses Llama 3.3 70B).

### Get a free Groq key (takes 1 minute)
1. Go to [console.groq.com](https://console.groq.com) and sign up free
2. Click **API Keys** → **Create API key**
3. Copy the key (starts with `gsk_...`)

### Add to Netlify
- Site settings → Environment variables → Add `GROQ_API_KEY` = your key

### Add to Vercel
- Project Settings → Environment Variables → Add `GROQ_API_KEY` = your key

### What happens when fallback fires
- The proxy tries Anthropic first (25 second timeout)
- If Anthropic fails for any reason, it instantly retries with Groq
- A purple **"⚡ Generated with Groq AI"** banner appears on screen for 6 seconds
- The meal plan response format is identical — app works exactly the same
- Groq has no web search tool, so fallback recipes come from model training data rather than live web search

### Fallback triggers
| Situation | Behavior |
|-----------|----------|
| Anthropic API down | → Groq |
| Anthropic rate limit (429) | → Groq |
| Anthropic timeout (>25s) | → Groq |
| Anthropic 5xx server error | → Groq |
| Both fail | Error message shown to user |
| `GROQ_API_KEY` not set | Error shown, no fallback |
