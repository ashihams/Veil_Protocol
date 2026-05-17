/**
 * Bridges Compact DKSAP stealth (crypto/) with agent-server x402 (midnight-hmac).
 *
 * HMAC + PaymentProofPayload must match `agent-server/src/payment-service.ts`, which uses
 * `@eddalabs/stealth-contract` `generatePaymentProof` / `generatePaymentProofPayloadBytes` (src/stealth.ts).
 *
 * Browser-safe: no `node:crypto` / Node `Buffer` (uses Web Crypto + optional Buffer polyfill).
 */
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

import { deriveStealthAddress } from "../crypto/stealth.js";
import type { StealthAnnouncement, StealthPublicKeys } from "../crypto/types.js";
import { announcements } from "../services/index.js";
import { generatePaymentProofPayloadBytes } from "../stealth.js";
import type { PaymentProofPayload } from "../types.js";

import type {
  PaymentAuthorization,
  PaymentPayload,
  PaymentRequired,
  SettlementResponse,
  TaskRequest,
  TaskResponse,
} from "./x402-types.js";

function utf8ToBase64(json: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)!;
  }
  return new TextDecoder().decode(bytes);
}

function randomNonceHex(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return "0x" + bytesToHex(b);
}

function randomRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export type PerformStealthPaymentResult = {
  stealthResult: ReturnType<typeof deriveStealthAddress>;
  announcement: StealthAnnouncement;
};

/**
 * Maps x402 authorization to the same `PaymentProofPayload` shape the server uses for HMAC.
 * (Mirrors `toProofPayload` in agent-server `payment-service.ts`.)
 */
export function authorizationToProofPayload(
  auth: PaymentAuthorization,
  payTo: string,
): PaymentProofPayload {
  return {
    agentId: `${auth.op}:${auth.a}:${auth.b}`,
    stealthAddress: payTo,
    amount: BigInt(auth.amount),
    tokenSymbol: "DUST",
    txId: auth.nonce,
    paymentRequestId: auth.requestId,
  };
}

function normalizeSharedSecret(sharedSecret: Uint8Array | string): Uint8Array {
  return typeof sharedSecret === "string" ? new TextEncoder().encode(sharedSecret) : sharedSecret;
}

/**
 * Stealth announcement for the current x402 challenge (no global store).
 */
export function createStealthAnnouncementForX402(
  recipientStealthKeys: StealthPublicKeys,
  paymentRequired: PaymentRequired,
): PerformStealthPaymentResult {
  const stealthResult = deriveStealthAddress(recipientStealthKeys);
  const req = paymentRequired.accepts[0];
  if (!req) {
    throw new Error("createStealthAnnouncementForX402: PaymentRequired.accepts is empty");
  }

  const announcement: StealthAnnouncement = {
    stealthAddress: stealthResult.stealthAddress,
    ephemeralPublicKey: stealthResult.ephemeralPublicKey,
    encryptedRandom: stealthResult.encryptedRandom,
    viewTag: stealthResult.viewTag,
    amount: BigInt(req.amount),
    token: req.asset,
    timestamp: Math.floor(Date.now() / 1000),
  };

  return { stealthResult, announcement };
}

/**
 * Derive stealth one-time payload, record in process-local `announcements` store (Node / tests).
 */
export function performStealthPayment(
  recipientStealthKeys: StealthPublicKeys,
  paymentRequired: PaymentRequired,
): PerformStealthPaymentResult {
  const r = createStealthAnnouncementForX402(recipientStealthKeys, paymentRequired);
  announcements.add(r.announcement);
  return r;
}

/** Fresh authorization for a retried `/task` call after a 402. */
export function createPaymentAuthorization(
  task: TaskRequest,
  paymentRequired: PaymentRequired,
): PaymentAuthorization {
  const accept = paymentRequired.accepts[0];
  if (!accept) {
    throw new Error("createPaymentAuthorization: missing accepts[0]");
  }
  return {
    requestId: randomRequestId(),
    op: task.op,
    a: task.a,
    b: task.b,
    amount: accept.amount,
    validBefore: Math.floor(Date.now() / 1000) + accept.maxTimeoutSeconds,
    nonce: randomNonceHex(),
  };
}

/**
 * Build full `PaymentPayload`, then return base64(JSON) for the `X-Payment-Signature` header.
 */
export function buildX402PaymentHeader(
  authorization: PaymentAuthorization,
  sharedSecret: Uint8Array | string,
  paymentRequired: PaymentRequired,
): string {
  const payTo = paymentRequired.accepts[0]?.payTo;
  if (!payTo) {
    throw new Error("buildX402PaymentHeader: missing accepts[0].payTo");
  }

  const secret = normalizeSharedSecret(sharedSecret);
  const proofPayload = authorizationToProofPayload(authorization, payTo);
  const body = generatePaymentProofPayloadBytes(proofPayload);
  const mac = hmac.create(sha256, secret).update(body).digest();
  const signature = `0x${bytesToHex(mac)}` as `0x${string}`;

  const paymentPayload: PaymentPayload = {
    x402Version: 2,
    resource: paymentRequired.resource,
    accepted: paymentRequired.accepts[0],
    payload: { signature, authorization },
  };

  return utf8ToBase64(JSON.stringify(paymentPayload));
}

export type FullStealthX402FlowResult = {
  taskResult: TaskResponse;
  stealthAddress: string;
  announcement: StealthAnnouncement;
  settlement: SettlementResponse;
  paymentRequired: PaymentRequired;
  authorization: PaymentAuthorization;
};

/**
 * End-to-end: 402 challenge → stealth announcement → HMAC payment header → paid /task.
 */
export async function fullStealthX402Flow(
  serverUrl: string,
  task: TaskRequest,
  recipientStealthKeys: StealthPublicKeys,
  sharedSecret: Uint8Array | string,
): Promise<FullStealthX402FlowResult> {
  const base = serverUrl.replace(/\/$/, "");
  const taskUrl = `${base}/task`;

  const secret = normalizeSharedSecret(sharedSecret);

  const r1 = await fetch(taskUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });

  if (r1.status !== 402) {
    const body = await r1.text();
    throw new Error(
      `fullStealthX402Flow: expected 402, got ${r1.status}. Body: ${body.slice(0, 200)}`,
    );
  }

  const paymentRequired = (await r1.json()) as PaymentRequired;
  if (
    paymentRequired.x402Version !== 2 ||
    !paymentRequired.accepts?.[0]?.payTo ||
    !paymentRequired.resource
  ) {
    throw new Error("fullStealthX402Flow: invalid PaymentRequired body");
  }

  const { stealthResult, announcement } = performStealthPayment(
    recipientStealthKeys,
    paymentRequired,
  );

  const auth = createPaymentAuthorization(task, paymentRequired);
  const paymentHeader = buildX402PaymentHeader(auth, secret, paymentRequired);

  const r2 = await fetch(taskUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Signature": paymentHeader,
    },
    body: JSON.stringify(task),
  });

  if (r2.status !== 200) {
    const body = await r2.text();
    throw new Error(
      `fullStealthX402Flow: paid request failed ${r2.status}. Body: ${body.slice(0, 200)}`,
    );
  }

  const taskResult = (await r2.json()) as TaskResponse;

  const settlementB64 = r2.headers.get("x-payment-response");
  if (!settlementB64) {
    throw new Error("fullStealthX402Flow: missing X-Payment-Response header");
  }
  const settlement = JSON.parse(base64ToUtf8(settlementB64)) as SettlementResponse;

  return {
    taskResult,
    stealthAddress: stealthResult.stealthAddress,
    announcement,
    settlement,
    paymentRequired,
    authorization: auth,
  };
}
