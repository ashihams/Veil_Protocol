import { randomUUID, randomBytes } from "node:crypto";
import {
  generatePaymentProof,
  verifyPaymentProof,
} from "@eddalabs/stealth-contract";
import type { PaymentProofPayload } from "@eddalabs/stealth-contract";
import type {
  TaskRequest,
  PaymentRequired,
  PaymentPayload,
  PaymentAuthorization,
  SettlementResponse,
} from "./types.js";

/** DUST per task (1 unit) */
const TASK_AMOUNT = "1";
const MAX_TIMEOUT_SECONDS = 60;
const NETWORK = "midnight:preview";
const MOCK_TX_PREFIX = "0xmidnight";

export function generateRequestId(): string {
  return randomUUID();
}

function randomNonce(): string {
  return "0x" + Buffer.from(randomBytes(32)).toString("hex");
}

export function buildPaymentRequired(
  requestId: string,
  task: TaskRequest,
  payTo: string,
): PaymentRequired {
  return {
    x402Version: 2,
    error: `Payment required to execute ${task.op}(${task.a}, ${task.b})`,
    resource: {
      url: `http://localhost/task`,
      description: `Compute ${task.op}(${task.a}, ${task.b})`,
    },
    accepts: [
      {
        scheme: "midnight-hmac",
        network: NETWORK,
        amount: TASK_AMOUNT,
        asset: "DUST",
        payTo,
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
      },
    ],
  };
}

/**
 * Build a canonical PaymentProofPayload from a PaymentAuthorization.
 * Must be stable: same inputs → same bytes → same HMAC.
 */
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

export interface VerifyResult {
  valid: boolean;
  auth?: PaymentAuthorization;
  reason?: string;
}

/**
 * Decode a base64 X-PAYMENT-SIGNATURE header and verify the HMAC.
 */
export function verifyAndExtract(
  header: string,
  sharedSecret: Uint8Array,
  payTo: string,
): VerifyResult {
  let payload: PaymentPayload;
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    payload = JSON.parse(json) as PaymentPayload;
  } catch {
    return { valid: false, reason: "malformed_header" };
  }

  const auth = payload.payload?.authorization;
  if (!auth || !payload.payload?.signature) {
    return { valid: false, reason: "missing_authorization" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (auth.validBefore < now) {
    return { valid: false, reason: "authorization_expired" };
  }

  const proofPayload = toProofPayload(auth, payTo);
  const sig = payload.payload.signature as `0x${string}`;
  const ok = verifyPaymentProof(proofPayload, sharedSecret, sig);

  if (!ok) return { valid: false, reason: "invalid_signature" };
  return { valid: true, auth };
}

export function buildSettlementResponse(auth: PaymentAuthorization): SettlementResponse {
  const mockTx = `${MOCK_TX_PREFIX}${auth.requestId.replace(/-/g, "")}`;
  return {
    success: true,
    transaction: mockTx,
    network: NETWORK,
  };
}

/**
 * Build a valid PaymentPayload for a given PaymentRequired challenge.
 * Used by the demo client and tests.
 */
export function buildPaymentPayload(
  required: PaymentRequired,
  sharedSecret: Uint8Array,
  task: TaskRequest,
  requestId: string,
): PaymentPayload {
  const auth: PaymentAuthorization = {
    requestId,
    op: task.op,
    a: task.a,
    b: task.b,
    amount: required.accepts[0].amount,
    validBefore: Math.floor(Date.now() / 1000) + MAX_TIMEOUT_SECONDS,
    nonce: randomNonce(),
  };

  const proofPayload = toProofPayload(auth, required.accepts[0].payTo);
  const signature = generatePaymentProof(proofPayload, sharedSecret);

  return {
    x402Version: 2,
    resource: required.resource,
    accepted: required.accepts[0],
    payload: { signature, authorization: auth },
  };
}
