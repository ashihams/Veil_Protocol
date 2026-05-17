# Veil Protocol — Vercel deployment

This repo deploys the **static frontend** (`frontend-vite-react`) to Vercel. The **x402 agent-server** (`agent-server`) is a separate Node service—host it on Railway, Render, Fly.io, a VPS, etc., then point the UI at it with `VITE_AGENT_SERVER_URL`.

Configuration in the repo is defined in **`vercel.json`** (Vercel reads it when the project root is the Git repository root).

| `vercel.json` field | Value | Notes |
|---------------------|--------|--------|
| `framework` | `vite` | Enables the Vite preset (asset handling, defaults). |
| `installCommand` | `npm install` | Runs at **repo root** so npm workspaces resolve (`frontend-vite-react`, `stealth-contract`, …). |
| `buildCommand` | `npm run build-production` | Root `package.json` script: LFS pull → `stealth-contract` build → frontend `copy-contract-keys` + `vite build`. |
| `outputDirectory` | `frontend-vite-react/dist` | Vercel serves this folder as the deployment. |
| `devCommand` | `npm run dev:frontend` | Used when you run `vercel dev` locally (optional). |

### If Vercel Root Directory is **`frontend-vite-react`** (and you cannot change it)

Some flows lock the subdirectory at creation. That is fine: the repo includes **`frontend-vite-react/vercel.json`**, which:

- runs **`cd .. && npm install`** so workspace deps (`@eddalabs/stealth-contract`, etc.) resolve from the monorepo root  
- runs **`cd .. && npm run build-production`** so `git lfs pull`, `stealth-contract` build, and `copy-contract-keys` + Vite all run from the real repo root  
- sets **`outputDirectory`** to **`dist`** (relative to `frontend-vite-react`, i.e. this app’s `dist/`)

In the dashboard, leave **Build and Output Settings** matching that file (or clear overrides so Vercel picks it up). **Framework Preset:** Vite.

**To use repo root instead later:** create a new Vercel project from the same Git repo with an **empty** Root Directory, or see Vercel **Settings → General → Root Directory** on supported plans.

---

**Preferred:** Leave **Root Directory** empty at import time and use the root **`vercel.json`** only. Only rely on **`frontend-vite-react/vercel.json`** when the UI forces a subdirectory root.

---

## Prerequisites

- GitHub (or GitLab / Bitbucket) repo connected to Vercel  
- **Git LFS** objects committed for `stealth-contract/src/managed/**` (keys / zkir)  
- **`scripts/deployments.json`** populated after `npm run deploy-all` (source of truth for addresses)  
- (Optional) A **public URL** for **agent-server** if the demo should use production x402, not localhost  

---

## One-time Vercel setup

### 1. Create the project

1. **Import** the Git repository in the Vercel dashboard.  
2. **Root Directory:** prefer **empty** (repository root) so the root **`vercel.json`** applies. If the project is already tied to **`frontend-vite-react`**, keep it — ensure **`frontend-vite-react/vercel.json`** is picked up (see table above).  
3. Confirm **Build Command** / **Output Directory** match the active `vercel.json`. Override manually if an old cache shows different values.

### 2. Enable Git LFS (required)

ZK artifacts are stored with Git LFS:

1. Project **Settings → Git**  
2. Turn **Git LFS** **ON**  
3. Save, then redeploy (**Deployments → … → Redeploy**, disable “Use existing Build Cache” if assets were wrong before)

If LFS is off, builds may succeed but the browser can receive **LFS pointer text** instead of binaries → prover/verifier failures.

### 3. Node.js version

The repo declares `"engines": { "node": ">=18" }`. Vercel will use a compatible Node version; to pin one, add **Settings → General → Node.js Version** (e.g. **20.x**).

### 4. Environment variables

**Settings → Environment Variables**. Use **Production** (and **Preview** if you want branch deploys) as needed.

#### Architectural distinction (important)

| Variable | Meaning |
|----------|---------|
| `VITE_STEALTH_CONTRACT_ADDRESS` | Legacy **standalone `stealth.compact` demo** (increment ledger / join helper only). **Not** deployed by `deploy-all`. |
| `VITE_STEALTH_SEND_ADDRESS` | **Real** deployed **StealthSend** Compact contract. |
| `VITE_STEALTH_KEY_REGISTRY_ADDRESS` | **Real** deployed **StealthKeyRegistry** contract. |
| `VITE_ANNOUNCEMENT_LOG_ADDRESS` | **Real** deployed **AnnouncementLog** contract. |

That separation keeps the production stealth stack (registry + send + announcements) independent from the old demo ledger env var.

#### Phase 1 — Vercel: only these for now

Set **exactly** the three addresses from **`scripts/deployments.json`** → `contracts` (update when you redeploy contracts):

```bash
VITE_STEALTH_KEY_REGISTRY_ADDRESS=05fdff7371c9f498f2b3a3953606b1c3f6d8dfbddefd0948c25134a52efb6fd4
VITE_STEALTH_SEND_ADDRESS=eb2c89ce96c09b5ebe5164d430675991185a8b8ee79df0449df476f485f8528b
VITE_ANNOUNCEMENT_LOG_ADDRESS=a10237a50fc0e285601189ca3e8ac163da91e0d98642ff823a6012d1ea0e67bf
```

**Do not** define `VITE_STEALTH_CONTRACT_ADDRESS` in Vercel. Leave it empty/unset so the app keeps the built-in zero placeholder for the unused `stealth.compact` join path. **Do not** point it at StealthSend.

#### Phase 2 — after the backend is public (e.g. Railway)

Add when **agent-server** has a public URL and you want the deployed UI to complete x402 against it:

```bash
VITE_AGENT_SERVER_URL=https://your-agent-server.up.railway.app
VITE_X402_SECRET=...
```

`VITE_X402_SECRET` must match **`AGENT_SERVER_SECRET`** on the backend (`agent-server/src/bin.ts`). Same string on Railway and Vercel.

Until Phase 2, the UI still loads and shows contract IDs; the browser x402 demo will keep defaulting to `http://localhost:3402` for the API unless you set `VITE_AGENT_SERVER_URL`.

#### Optional — Midnight indexer / prover overrides

| Variable | Description |
|----------|-------------|
| `VITE_MIDNIGHT_INDEXER_HTTP` | GraphQL indexer HTTP URL |
| `VITE_MIDNIGHT_INDEXER_WS` | Indexer WebSocket URL |
| `VITE_MIDNIGHT_PROVER_URL` | HTTP proof server URL for in-browser proving |

Preview defaults are baked in; change these if you target **preprod** or a custom indexer.

#### Optional — only if you deploy `stealth.compact` yourself

| Variable | Description |
|----------|-------------|
| `VITE_STEALTH_CONTRACT_ADDRESS` | Set **only** if you intentionally deployed the **`stealth.compact`** ledger and want `StealthAppProvider` join/deploy helpers to target it. Otherwise omit everywhere (including Vercel). |

After changing env vars, **redeploy** so Vite embeds the new `VITE_*` values at build time.

---

## What `build-production` does (root `package.json`)

1. `git lfs pull` — ensure large managed files are present in the build environment  
2. `cd stealth-contract && npm run build` — TypeScript build + copy `src/managed` into `stealth-contract/dist` (no `compact` CLI on Vercel required if committed artifacts are up to date)  
3. `cd frontend-vite-react && npm run build` — **`copy-contract-keys`** copies `stealth-contract/src/managed/stealth/{keys,zkir}` → `public/midnight/stealth/`, then **Vite** emits `frontend-vite-react/dist`  

---

## After deploy — checks

1. **Static ZK file** — open (replace host):  
   `https://<your-project>.vercel.app/midnight/stealth/keys/increment.verifier`  
   Expect **200** and binary body, not 404 and not plain-text LFS pointers.  

2. **App** — open `/`. Contract IDs reflect your **`VITE_STEALTH_*`** / **`VITE_ANNOUNCEMENT_LOG_*`** env vars (or built-in Preview defaults).  

3. **Full x402 flow** — only works if `VITE_AGENT_SERVER_URL` and shared secret match a reachable **agent-server**.

---

## Common issues

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| LFS pointer or tiny “verifier” file in browser | LFS off in Vercel or bad clone | Enable LFS; redeploy without cache |
| Proof / “mismatched verifier” errors | Stale or missing keys in `public/midnight/stealth` | Refresh `stealth-contract/src/managed`, run local `npm run build-production`, commit; redeploy |
| 402 / payment always fails from deployed site | Agent URL or secret | Set `VITE_AGENT_SERVER_URL` + `VITE_X402_SECRET`; deploy agent-server with matching secret |
| Wrong chain / indexer errors | Preview vs preprod | Align `VITE_MIDNIGHT_*` and on-chain contract IDs with the same network |

---

## Checklists

**First production deploy**

- [ ] Git LFS enabled on the Vercel project  
- [ ] Root directory either **repo root** (root `vercel.json`) or **`frontend-vite-react`** with matching `frontend-vite-react/vercel.json` / dashboard commands  
- [ ] `VITE_STEALTH_KEY_REGISTRY_ADDRESS`, `VITE_STEALTH_SEND_ADDRESS`, and `VITE_ANNOUNCEMENT_LOG_ADDRESS` set (match `scripts/deployments.json`)  
- [ ] **`VITE_STEALTH_CONTRACT_ADDRESS` not set** on Vercel (correct default)  
- [ ] Phase 2 when ready: `VITE_AGENT_SERVER_URL` + `VITE_X402_SECRET` matching **`AGENT_SERVER_SECRET`** on Railway/backend  
- [ ] `/midnight/stealth/keys/…` returns real binaries  

**Every release**

- [ ] Managed ZK artifacts updated in Git when contracts change  
- [ ] Env vars updated if addresses or agent URL change  
- [ ] Redeploy without cache if LFS or asset issues appear  

---

## What helps if something still fails

Share **non-secret** details and we can narrow it down quickly:

- Vercel **build log** (last ~80 lines around the failure)  
- Whether **Git LFS** is ON and a sample **response headers + first bytes** for a `.verifier` URL  
- **Midnight network** (Preview vs preprod) and the three **stealth stack** addresses you set  
- **agent-server** host (domain only) and whether **`VITE_X402_SECRET`** is intentionally set on both sides  

Secrets (mnemonics, raw **`AGENT_SERVER_SECRET`** / **`VITE_X402_SECRET`** values) should stay out of tickets—confirm only that they match between Vercel and the server.
