# Phantom Protocol

**Private agent-to-agent payments on Midnight Network.**

Phantom Protocol enables AI agents to pay each other using stealth addresses — no observer can see who paid whom, how much, or for what. Built on Midnight's zero-knowledge proof system with real Compact smart contracts deployed to Preview network.

> 6 ZK contracts compiled and deployed · Real DKSAP cryptography · x402 HTTP payment flow · Working end-to-end demo

---

## Quick Demo

**Terminal 1 — Start the x402 payment server**

```bash
cd agent-server && npm run dev
```

**Terminal 2 — Start the frontend**

```bash
cd frontend-vite-react && npm run dev
```

Open **http://localhost:5173/stealth** and follow the numbered steps at the bottom of the page.

**Terminal 3 — Run the headless E2E proof (optional)**

```bash
cd stealth-contract && npm run test:e2e
```

```
🔑 Step 1: Generated stealth keys for both agents
📡 Step 2: POST /task → 402 Payment Required
🎯 Step 3: Derived stealth address: 0xf455b4...d6c186
📋 Step 4: Announcement created (viewTag: 0xc6)
🔐 Step 5: Payment authorization built
✍️  Step 6: HMAC signature computed
💰 Step 7: POST /task with payment → 200 OK (result: 100)
🔍 Step 8: Agent B scanned — MATCH FOUND ✅
⏱️  Total: 87ms
═══════════════════════════════════════════════
🎉 STEALTH x402 PAYMENT — FULLY WORKING
═══════════════════════════════════════════════
```

---

## How It Works

Agent A wants to pay Agent B for a service — privately.

1. **Agent A** requests a service → gets **HTTP 402 Payment Required** with payment terms
2. Agent A looks up Agent B's stealth public keys (spending key + viewing key)
3. Agent A generates a **one-time stealth address** using DKSAP elliptic curve cryptography — a fresh address that only Agent B can detect and spend from
4. Agent A signs an **x402 payment proof** (HMAC-SHA256) and retries the request
5. The server verifies the proof → returns **200 + the result** (42 + 58 = 100)
6. Agent A stores an **encrypted announcement** (stealth address, ephemeral pubkey R, view tag)
7. **Agent B** scans announcements using its private viewing key — finds the match, derives the stealth private key
8. No third party can link the payment to Agent B's real identity

---

## Deployed on Midnight Preview

All 6 contracts are live with real ZK circuits on Midnight Preview network:

| Contract | Circuits | Address |
|---|---|---|
| Identity Registry | 2 | `54ab9b44610e7353f1af0900d45853ded55bbfd0604a4d5cf3b78875f050951d` |
| Reputation Registry | 2 | `38d5c44a9735fa2997bea9cbae5c910aa3be293839c96c09c65c291e668aa23e` |
| Validation Registry | 1 | `a7ef1e39753d89e7031831d4779a08aee3b3974eea67feba052c03ccdf762d4c` |
| Stealth Key Registry | 2 | `05fdff7371c9f498f2b3a3953606b1c3f6d8dfbddefd0948c25134a52efb6fd4` |
| Stealth Send | 1 | `eb2c89ce96c09b5ebe5164d430675991185a8b8ee79df0449df476f485f8528b` |
| Announcement Log | 1 | `a10237a50fc0e285601189ca3e8ac163da91e0d98642ff823a6012d1ea0e67bf` |

---

## Architecture

```
Layer 1 — Agent Discovery (ERC-8004 inspired)
├── Identity Registry    — agent IDs, capabilities, stealth public keys
├── Reputation Registry  — on-chain feedback signals
└── Validation Registry  — ZK proof attestations

Layer 2 — x402 Payment Trigger (HTTP)
├── POST /task           → 402 Payment Required (scheme, amount, payTo)
├── DKSAP stealth address derivation (client-side)
├── HMAC-SHA256 payment signature
└── POST /task + X-Payment-Signature → 200 + result

Layer 3 — Midnight Stealth Core (Compact 0.28)
├── StealthKeyRegistry.compact  — stores spending + viewing public keys
├── StealthSend.compact         — mintShieldedToken + announcement storage
└── AnnouncementLog.compact     — encrypted announcement rows for scanning

Layer 4 — Privacy
├── Zswap shielded UTXOs        — payment amounts hidden on-chain
├── Selective disclosure         — per-party visibility (public / receiver / auditor)
└── DUST fee model               — no relayer needed for withdrawals
```

---

## Stealth Cryptography (DKSAP)

Phantom Protocol uses the Dual-Key Stealth Address Protocol — the same elliptic curve math used by Umbra on Ethereum, implemented with `@noble/secp256k1`.

```
Receiver publishes:     P_spend = p_spend × G
                        P_view  = p_view  × G

Sender generates:       r (random scalar)
                        R = r × G              (ephemeral public key)

Shared secret:          S = r × P_view         (ECDH)

Stealth address:        addr = H(S) × G + P_spend

View tag:               first byte of H(S)     (fast-scan optimization)

Receiver scanning:      S' = p_view × R
                        check: H(S') × G + P_spend == addr ?
                        if match → p_stealth = H(S') + p_spend
```

The view tag allows receivers to reject non-matching announcements after a single byte comparison instead of a full elliptic curve operation — the same optimization Umbra uses for performance.

---

## What Midnight Adds

**Shielded amounts** — `StealthSend.compact` calls `mintShieldedToken()` so the payment value enters Midnight's Zswap UTXO pool. The amount is never visible on the public ledger.

**On-chain announcements via Compact** — announcement rows (stealth address, ephemeral key R, encrypted random, view tag) are stored in contract state through ZK-verified circuits, not public event logs.

**DUST eliminates the relayer** — on Ethereum, stealth addresses need ETH for gas, requiring a relayer for token withdrawals. On Midnight, the receiver pays fees in DUST (generated by holding NIGHT), so no relayer infrastructure is needed.

**Selective disclosure** — the Privacy Dashboard in the demo shows three views of the same payment. The public sees only that a payment occurred. The receiver sees full details. An auditor sees only what's explicitly disclosed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Midnight Compact 0.28, compiled to ZK circuits |
| Cryptography | @noble/secp256k1, @noble/hashes (DKSAP + HMAC-SHA256) |
| Backend | Node.js HTTP server, x402 payment protocol |
| Frontend | React + Vite + Tailwind CSS (dark Midnight theme) |
| Deployment | Midnight Preview network, remote proof server |
| Monorepo | npm workspaces + Turborepo |

---

## Project Structure

```
Phantom_Protocol/
├── agent-contract/        # ERC-8004 registries (Identity, Reputation, Validation)
│   └── src/
│       ├── identity.compact
│       ├── reputation.compact
│       ├── validation.compact
│       └── managed/            # Compiled ZK artifacts
├── agent-cli/             # Agent registry deployment tool
├── agent-server/          # x402 HTTP payment server
│   └── src/
│       ├── server.ts           # POST /task with 402 challenge
│       ├── payment-service.ts  # HMAC proof generation + verification
│       └── agent-pool.ts       # Task dispatch
├── stealth-contract/      # DKSAP stealth core
│   └── src/
│       ├── crypto/             # stealth.ts (DKSAP), types.ts, test-stealth.ts
│       ├── bridge/             # x402-stealth-bridge.ts (connects DKSAP to x402)
│       ├── services/           # In-memory registry, announcements, verifier
│       ├── contracts/          # 3 Compact source files
│       ├── managed/            # Compiled ZK artifacts
│       └── test-e2e.ts         # Full flow test
├── frontend-vite-react/   # Demo UI
│   └── src/pages/stealth/ # Two-panel buyer/seller demo
├── scripts/               # deploy-all.ts + deployments.json
├── counter-contract/      # Midnight starter template (reference)
└── counter-cli/           # Counter deployer (reference)
```

---

## Running Tests

```bash
# Crypto unit tests (DKSAP lifecycle)
cd stealth-contract && npm run test:crypto

# Bridge integration test (requires agent-server running)
cd stealth-contract && npm run test:bridge

# Full end-to-end flow (requires agent-server running)
cd stealth-contract && npm run test:e2e
```

---

## Setup From Scratch

```bash
git lfs install
git clone https://github.com/ashihams/Phantom_Protocol.git
cd Phantom_Protocol
npm install
npm run build
```

Copy environment templates:

```bash
cp frontend-vite-react/.env_template frontend-vite-react/.env
cp scripts/.env.template scripts/.env
```

To redeploy contracts (requires Lace wallet + tNIGHT from the Preview faucet):

```bash
npx tsx scripts/deploy-all.ts
```

---

## References

- [Midnight Network Docs](https://docs.midnight.network)
- [Compact Standard Library API](https://docs.midnight.network/compact/standard-library/exports)
- [x402 Payment Protocol](https://www.x402.org)
- [ERC-5564 — Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564)
- [ERC-8004 — Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)
- [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1)

---

## License

MIT