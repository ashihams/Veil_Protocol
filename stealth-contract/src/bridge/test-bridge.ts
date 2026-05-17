/**
 * Integration test: bridge HMAC matches `generatePaymentProofPayloadBytes` + server verify path.
 *
 * Prerequisite: `cd agent-server && npm run dev` (default http://localhost:3402).
 *
 * Run: npx tsx stealth-contract/src/bridge/test-bridge.ts
 */
import { generatePaymentProof, verifyPaymentProof } from "../stealth.js";
import { generateStealthKeys } from "../crypto/stealth.js";

import {
  authorizationToProofPayload,
  buildX402PaymentHeader,
  fullStealthX402Flow,
} from "./x402-stealth-bridge.js";
import type { PaymentRequirements, TaskRequest } from "./x402-types.js";

const SERVER_URL = process.env.AGENT_SERVER_URL ?? "http://localhost:3402";
const SHARED_SECRET_STR = process.env.AGENT_SERVER_SECRET ?? "midnight-demo-secret";
const PAY_TO = process.env.AGENT_SERVER_PAY_TO ?? "0x0000000000000000000000000000000000000001";

async function main(): Promise<void> {
  const sharedSecret = new TextEncoder().encode(SHARED_SECRET_STR);

  console.log("=== x402 ↔ stealth bridge tests ===\n");

  // ── Unit: canonical payload + HMAC matches stealth-contract (same as agent-server uses) ──
  const task: TaskRequest = { op: "add", a: 7, b: 5 };
  const requirements: PaymentRequirements = {
    scheme: "midnight-hmac",
    network: "midnight:preview",
    amount: "1",
    asset: "DUST",
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
  };
  const paymentRequired = {
    x402Version: 2 as const,
    error: "test",
    resource: { url: `${SERVER_URL}/task`, description: "test" },
    accepts: [requirements],
  } satisfies import("./x402-types.js").PaymentRequired;

  const authorization = {
    requestId: "bridge-test-" + Date.now(),
    op: task.op,
    a: task.a,
    b: task.b,
    amount: paymentRequired.accepts[0].amount,
    validBefore: Math.floor(Date.now() / 1000) + 60,
    nonce: "0x" + "ab".repeat(32),
  };

  const proofPayload = authorizationToProofPayload(authorization, PAY_TO);
  const sigLocal = generatePaymentProof(proofPayload, sharedSecret);
  if (!verifyPaymentProof(proofPayload, sharedSecret, sigLocal)) {
    console.error("FAIL: local verifyPaymentProof");
    process.exit(1);
  }
  console.log("✓ Local HMAC (stealth.ts) verify OK");

  const headerB64 = buildX402PaymentHeader(authorization, sharedSecret, paymentRequired);
  const decoded = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8")) as {
    payload: { signature: string };
  };
  if (!verifyPaymentProof(proofPayload, sharedSecret, decoded.payload.signature as `0x${string}`)) {
    console.error("FAIL: decoded header signature does not match canonical payload");
    process.exit(1);
  }
  console.log("✓ buildX402PaymentHeader matches generatePaymentProof\n");

  // ── Integration: full flow against running server ──
  console.log(`Calling live server at ${SERVER_URL} ...`);
  const keys = generateStealthKeys();
  const recipient = {
    spendingPublicKey: keys.spendingPublicKey,
    viewingPublicKey: keys.viewingPublicKey,
  };

  try {
    const out = await fullStealthX402Flow(SERVER_URL, task, recipient, sharedSecret);
    const expected = task.a + task.b;
    if (out.taskResult.result !== expected) {
      console.error("FAIL: result", out.taskResult.result, "expected", expected);
      process.exit(1);
    }
    if (!out.settlement.success) {
      console.error("FAIL: settlement", out.settlement);
      process.exit(1);
    }
    console.log(`✓ fullStealthX402Flow: ${task.a} + ${task.b} = ${out.taskResult.result}`);
    console.log(`  stealthAddress: ${out.stealthAddress}`);
    console.log(`  settlement.tx: ${out.settlement.transaction}`);
  } catch (e) {
    console.error("FAIL: fullStealthX402Flow — is agent-server running?", e);
    process.exit(1);
  }
}

main();
