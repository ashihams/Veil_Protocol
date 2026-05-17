# Phantom Protocol — Demo Script (2 minutes)

## Setup (30 seconds before judges arrive)

```bash
# Terminal 1
cd agent-server && npm run dev

# Terminal 2
cd frontend-vite-react && npm run dev
```

Open http://localhost:5173/stealth in the browser. Have a third terminal ready with `cd stealth-contract && npm run test:e2e` as backup if the UI glitches.

---

## The Pitch (20 seconds)

"Phantom Protocol is private agent commerce on Midnight. AI agents discover each other, negotiate payment via HTTP 402, and settle privately using stealth addresses. The receiver is unlinkable. The amount is hidden by Zswap. We have six real ZK contracts compiled with Compact 0.28 and deployed to Midnight Preview — not mocks."

---

## Live Demo (90 seconds)

**Step 1 — Keys**
"Both agents have stealth key pairs — a spending key and a viewing key. These are real secp256k1 keys generated with the same DKSAP protocol that Umbra uses."
→ Point to the key displays on both panels.

**Step 2 — Request Service**
"Agent A requests a computation task. The server responds with HTTP 402 Payment Required — here are the payment terms: 1 DUST, midnight-hmac scheme, preview network."
→ Click **Request Task**. Point to the 402 challenge box.

**Step 3 — Stealth Payment**
"Agent A derives a fresh one-time stealth address from Agent B's public keys. This address is mathematically unlinkable to Agent B. Then it signs the x402 payment proof and retries."
→ Click **Derive Stealth Address & Pay**. Point to the stealth address, ephemeral key R, and view tag.

**Step 4 — Result**
"42 + 58 = 100. Payment verified, task completed, settlement confirmed on-chain."
→ Point to the green result and settlement transaction hash.

**Step 5 — Receiver Scanning**
"Now Agent B scans the announcements using its private viewing key. It finds the match and derives the stealth private key — only Agent B can do this."
→ Click **Scan Announcements** on the right panel. Point to the green checkmark and derived key.

**Step 6 — Privacy Dashboard**
"Three views of the same payment. The public sees only that a payment occurred. The receiver sees everything. The auditor sees only what's selectively disclosed — that's Midnight's programmable privacy."
→ Point to the three columns. Toggle the auditor disclosure checkbox.

---

## Key Innovation (10 seconds)

"Traditional stealth protocols hide the receiver but expose amounts and announcements on a transparent chain. Midnight lets us hide all of it — the amount goes into a Zswap shielded UTXO via `mintShieldedToken`, announcements are stored through ZK-verified Compact circuits, and DUST eliminates the relayer that every Ethereum stealth protocol needs. Six real contracts, not simulations."

---

## If Asked

**"Is this deployed?"** — Yes, all six contracts are live on Midnight Preview. Addresses are in `scripts/deployments.json`.

**"Is the crypto real?"** — Yes, full DKSAP with @noble/secp256k1. Run `npm run test:crypto` to see all tests pass.

**"What about the agent registry?"** — Three ERC-8004-inspired Compact contracts (Identity, Reputation, Validation) handle agent discovery and trust. They compile and deploy alongside the stealth contracts.

**"How is this different from Umbra?"** — Umbra hides the receiver on Ethereum but amounts, announcements, and the transaction graph are all public. Phantom Protocol on Midnight hides all of these using Zswap shielded UTXOs, Compact circuits for announcement storage, and DUST for gas-free withdrawals.
