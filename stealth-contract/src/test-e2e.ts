/**
 * Full stealth (compact DKSAP) + x402 (midnight-hmac) E2E against a live agent-server.
 *
 * Prerequisite: `cd agent-server && npm run dev` (default http://localhost:3402)
 *
 * Run: npx tsx stealth-contract/src/test-e2e.ts
 */
import { randomBytes, randomUUID } from "node:crypto";

import {
  deriveStealthAddress,
  generateStealthKeys,
  scanAnnouncements,
} from "./crypto/stealth.js";
import type { StealthAnnouncement, StealthKeyPair } from "./crypto/types.js";
import type { PaymentAuthorization, PaymentPayload, PaymentRequired, TaskRequest } from "./bridge/x402-types.js";
import { generatePaymentProof } from "./stealth.js";
import type { PaymentProofPayload } from "./types.js";

const AGENT_URL = (process.env.AGENT_SERVER_URL ?? "http://localhost:3402").replace(/\/$/, "");
const SHARED_SECRET = new TextEncoder().encode("midnight-demo-secret");

const TASK: TaskRequest = { op: "add", a: 42, b: 58 };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function truncateAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function viewTagHex(tag: number): string {
  return `0x${tag.toString(16).padStart(2, "0")}`;
}

/** Same mapping as `toProofPayload` in agent-server `payment-service.ts`. */
function toProofPayload(auth: PaymentAuthorization, payTo: string): PaymentProofPayload {
  return {
    agentId: `${auth.op}:${auth.a}:${auth.b}`,
    stealthAddress: payTo,
    amount: BigInt(auth.amount),
    tokenSymbol: "DUST",
    txId: auth.nonce,
    paymentRequestId: auth.requestId,
  };
}

function randomNonceHex(): string {
  return "0x" + Buffer.from(randomBytes(32)).toString("hex");
}

async function main(): Promise<void> {
  const t0 = Date.now();

  const agentA: StealthKeyPair = generateStealthKeys();
  const agentB: StealthKeyPair = generateStealthKeys();
  void agentA;
  console.log("🔑 Step 1: Generated stealth keys for both agents");

  const taskUrl = `${AGENT_URL}/task`;
  const r1 = await fetch(taskUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(TASK),
  });
  assert(r1.status === 402, `expected HTTP 402, got ${r1.status}`);
  const paymentRequired = (await r1.json()) as PaymentRequired;
  assert(paymentRequired.x402Version === 2, "invalid x402Version");
  assert(
    paymentRequired.accepts?.[0]?.payTo && paymentRequired.accepts[0].amount,
    "invalid accepts[0]",
  );
  console.log("📡 Step 2: POST /task → 402 Payment Required");

  const sellerPublic = {
    spendingPublicKey: agentB.spendingPublicKey,
    viewingPublicKey: agentB.viewingPublicKey,
  };
  const derived = deriveStealthAddress(sellerPublic);
  assert(
    derived.stealthAddress.startsWith("0x"),
    "stealthAddress must start with 0x",
  );
  console.log(`🎯 Step 3: Derived stealth address: ${truncateAddr(derived.stealthAddress)}`);

  const accept0 = paymentRequired.accepts[0];
  const announcement: StealthAnnouncement = {
    stealthAddress: derived.stealthAddress,
    ephemeralPublicKey: derived.ephemeralPublicKey,
    encryptedRandom: derived.encryptedRandom,
    viewTag: derived.viewTag,
    amount: BigInt(accept0.amount),
    token: accept0.asset,
    timestamp: Math.floor(Date.now() / 1000),
  };
  const announcements: StealthAnnouncement[] = [announcement];
  console.log(`📋 Step 4: Announcement created (viewTag: ${viewTagHex(derived.viewTag)})`);

  const authorization: PaymentAuthorization = {
    requestId: randomUUID(),
    op: TASK.op,
    a: TASK.a,
    b: TASK.b,
    amount: accept0.amount,
    validBefore: Math.floor(Date.now() / 1000) + 300,
    nonce: randomNonceHex(),
  };
  console.log("🔐 Step 5: Payment authorization built");

  const payTo = accept0.payTo;
  const proofPayload = toProofPayload(authorization, payTo);
  const signature = generatePaymentProof(proofPayload, SHARED_SECRET);
  assert(signature.startsWith("0x") && signature.length === 66, "expected 32-byte HMAC hex");
  console.log("✍️  Step 6: HMAC signature computed");

  const fullPayload: PaymentPayload = {
    x402Version: 2,
    resource: paymentRequired.resource,
    accepted: accept0,
    payload: { signature, authorization },
  };
  const paymentHeader = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64");

  const r2 = await fetch(taskUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Signature": paymentHeader,
    },
    body: JSON.stringify(TASK),
  });
  const paidText = await r2.text();
  if (r2.status !== 200) {
    throw new Error(`ASSERT: expected HTTP 200, got ${r2.status}: ${paidText.slice(0, 500)}`);
  }
  const body = JSON.parse(paidText) as { result: number; agentId: string };
  assert(body.result === 100, `expected result 100, got ${body.result}`);
  assert(typeof body.agentId === "string" && body.agentId.length > 0, "missing agentId");
  assert(/^add-agent-\d+$/.test(body.agentId), `unexpected agentId shape: ${body.agentId}`);
  console.log(`💰 Step 7: POST /task with payment → 200 OK (result: ${body.result})`);

  const hits = scanAnnouncements(
    announcements,
    agentB.viewingPrivateKey,
    agentB.spendingPublicKey,
    agentB.spendingPrivateKey,
  );
  assert(hits.length === 1, `expected 1 scan hit, got ${hits.length}`);
  assert(
    hits[0]!.stealthAddress.toLowerCase() === derived.stealthAddress.toLowerCase(),
    "scanned stealthAddress mismatch",
  );
  console.log("🔍 Step 8: Agent B scanned — MATCH FOUND ✅");

  const elapsed = Date.now() - t0;
  console.log("");
  console.log(`⏱️  Total: ${elapsed}ms`);
  console.log("");
  console.log("═══════════════════════════════════════════════");
  console.log("🎉 Veil Protocol — STEALTH × x402 PAYMENT OK");
  console.log("═══════════════════════════════════════════════");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
