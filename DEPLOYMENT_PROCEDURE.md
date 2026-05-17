# Veil Protocol — Deployment Procedure for Vercel

## Prerequisites

- GitHub repository connected to Vercel
- Stealth / agent contracts deployed and addresses available for the frontend
- Vercel account with project created

## One-Time Setup in Vercel

### 1. Enable Git LFS (CRITICAL)

This project uses Git LFS for Compact ZK artifacts under `stealth-contract/src/managed/`. Enable LFS on Vercel:

1. Go to **[Vercel Dashboard](https://vercel.com/dashboard)**
2. Select your project
3. Go to **Settings → Git**
4. Find **"Git LFS"**
5. **Toggle it ON**
6. Click **Save**

### 2. Configure Environment Variables

Go to **Settings → Environment Variables** and add (Production, Preview, Development as needed):

| Variable | Purpose |
|----------|---------|
| `VITE_STEALTH_CONTRACT_ADDRESS` | Deployed stealth “main” contract address the UI binds to (see `frontend-vite-react/src/routes/__root.tsx`) |
| `VITE_MIDNIGHT_INDEXER_HTTP` | Optional override; defaults to Preview GraphQL indexer |
| `VITE_MIDNIGHT_INDEXER_WS` | Optional WebSocket indexer URL |
| `VITE_MIDNIGHT_PROVER_URL` | Optional HTTP proof server URL for client-side proving |
| `VITE_AGENT_SERVER_URL` | x402 demo server base URL if not using default `http://localhost:3402` (production API) |
| `VITE_X402_SECRET` | Shared HMAC secret if it must match a deployed agent-server |

### 3. Verify Build Settings

**Settings → General → Build & Development Settings** should match `vercel.json`:

- **Framework Preset**: Vite  
- **Build Command**: `npm run build-production`  
- **Output Directory**: `frontend-vite-react/dist`  
- **Install Command**: `npm install`  

If values are wrong, re-import the project or set them manually.

## What `build-production` Does

From the repo root:

1. `git lfs pull` — fetch binary ZK artifacts  
2. `cd stealth-contract && npm run build` — compile/package stealth contracts if your pipeline requires it  
3. `cd ../frontend-vite-react && npm run build` — runs `copy-contract-keys` then `vite build`  

`copy-contract-keys` copies `stealth-contract/src/managed/stealth/keys` and `.../zkir` into `frontend-vite-react/public/midnight/stealth/` so the browser can load verifiers at `/midnight/stealth/...`.

## Post-Deployment Verification

### Build logs

You should see `stealth-contract` build (if applicable), then `copy-contract-keys`, then Vite production build.

### Static ZK assets

After deploy, a stealth verifier URL should return **200** with binary content (not Git LFS pointer text), for example:

`https://your-app.vercel.app/midnight/stealth/keys/increment.verifier`

Byte size depends on your Compact outputs; the important check is **not 404** and **not an LFS pointer**.

### Application

1. Open the deployed origin at `/` — the stealth × x402 demo is the only screen.  
2. Confirm `VITE_STEALTH_CONTRACT_ADDRESS` matches your deployment if the UI shows deployment errors.

## Common Issues

### Git LFS pointer text in the browser

**Cause**: LFS not enabled on Vercel or objects not pulled. **Fix**: enable LFS in project settings, redeploy without cache.

### “Mismatched verifier” / failing proofs in the UI

**Cause**: Stale or missing keys in `public/midnight/stealth`. **Fix**: run a fresh `stealth-contract` build locally, commit updated `src/managed`, ensure `build-production` runs before `vite build`.

### Wrong network / indexer

**Cause**: Preview vs preprod mismatch. **Fix**: set `VITE_MIDNIGHT_INDEXER_*` (and contract addresses) to the network you deployed to.

## Checklist — First Deploy

- [ ] Git LFS enabled for the Vercel project  
- [ ] `VITE_STEALTH_CONTRACT_ADDRESS` set to the deployed contract  
- [ ] Optional indexer/prover overrides if not on default Preview  
- [ ] Build command `npm run build-production`, output `frontend-vite-react/dist`  
- [ ] Managed artifacts committed (or generated in CI before frontend build)  

## Checklist — Every Deploy

- [ ] Contract or ZK artifacts updated → rebuild `stealth-contract` and copy keys  
- [ ] Env vars updated if addresses or network changed  
- [ ] Redeploy without cache if LFS or asset issues appear  
