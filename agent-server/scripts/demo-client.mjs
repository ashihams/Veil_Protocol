#!/usr/bin/env node
/**
 * demo-client.mjs — end-to-end x402 demo
 *
 * Run: node agent-server/scripts/demo-client.mjs
 * (server must be running: npm run dev --workspace=agent-server)
 */

import { createHmac } from "node:crypto";
import http from "node:http";

const SERVER = "http://localhost:3402";
const TASK = { op: "add", a: 2, b: 3 };

// Must match the server's DEMO_SECRET in server.ts dev entrypoint
const SHARED_SECRET = "midnight-demo-secret";

// ─── helpers ───────────────────────────────────────────────────────────────

function hmacSha256(secret, ...messages) {
  const mac = createHmac("sha256", Buffer.from(secret));
  for (const m of messages) mac.update(m);
  return "0x" + mac.digest("hex");
}

function request(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: opts.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── canonical payload bytes (must match server's toProofPayload) ──────────

function canonicalBytes(auth, payTo) {
  const proofPayload = {
    agentId: `${auth.op}:${auth.a}:${auth.b}`,
    amount: String(auth.amount),
    paymentRequestId: auth.requestId,
    stealthAddress: payTo.toLowerCase(),
    tokenSymbol: "DUST",
    txId: auth.nonce,
  };
  return Buffer.from(JSON.stringify(proofPayload));
}

// ─── main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log("=== x402 Agent Marketplace Demo ===\n");
  console.log(`Task: ${TASK.op}(${TASK.a}, ${TASK.b})\n`);

  // ── Step 1: request task without payment ──────────────────────────────────
  console.log("Step 1: POST /task (no payment)");
  const step1 = await request(`${SERVER}/task`, { body: TASK });
  console.log(`  ← HTTP ${step1.status}`);

  if (step1.status !== 402) {
    console.error("Expected 402, got", step1.status);
    process.exit(1);
  }

  const required = JSON.parse(
    Buffer.from(step1.headers["x-payment-required"], "base64").toString("utf8"),
  );
  console.log("  ← X-Payment-Required decoded:");
  console.log(`     scheme  : ${required.accepts[0].scheme}`);
  console.log(`     network : ${required.accepts[0].network}`);
  console.log(`     amount  : ${required.accepts[0].amount} ${required.accepts[0].asset}`);
  console.log(`     payTo   : ${required.accepts[0].payTo}`);
  console.log(`     error   : ${required.error}\n`);

  // ── Step 2: build payment payload ─────────────────────────────────────────
  console.log("Step 2: Build PaymentPayload");
  const requestId = required.error.match(/req-[a-f0-9-]+/)?.[0] ??
    "demo-" + Date.now().toString(36);
  const nonce = "0x" + Buffer.from(
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
  ).toString("hex");

  const auth = {
    requestId,
    op: TASK.op,
    a: TASK.a,
    b: TASK.b,
    amount: required.accepts[0].amount,
    validBefore: Math.floor(Date.now() / 1000) + 60,
    nonce,
  };

  const payTo = required.accepts[0].payTo;
  const bytes = canonicalBytes(auth, payTo);
  const secret = Buffer.from(SHARED_SECRET);
  const signature = hmacSha256(secret, bytes);

  const paymentPayload = {
    x402Version: 2,
    resource: required.resource,
    accepted: required.accepts[0],
    payload: { signature, authorization: auth },
  };

  console.log(`  → signature (first 18 chars): ${signature.slice(0, 18)}...\n`);

  // ── Step 3: retry with payment ────────────────────────────────────────────
  console.log("Step 3: POST /task + X-Payment-Signature");
  const payloadHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
  const step3 = await request(`${SERVER}/task`, {
    body: TASK,
    headers: { "X-Payment-Signature": payloadHeader },
  });

  console.log(`  ← HTTP ${step3.status}`);
  if (step3.status !== 200) {
    console.error("Payment rejected:", step3.body);
    process.exit(1);
  }

  console.log(`  ← result : ${step3.body.result}`);
  console.log(`  ← agent  : ${step3.body.agentId}`);

  const settlement = JSON.parse(
    Buffer.from(step3.headers["x-payment-response"], "base64").toString("utf8"),
  );
  console.log(`  ← settlement.success : ${settlement.success}`);
  console.log(`  ← settlement.tx      : ${settlement.transaction}\n`);

  console.log(`✓ ${TASK.a} + ${TASK.b} = ${step3.body.result}`);
})();
