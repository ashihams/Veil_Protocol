/**
 * Inline copy of `PaymentProofPayload` + HMAC proof helpers from `stealth-contract/src/stealth.ts`
 * so agent-server builds without the monorepo workspace package (Railway/Docker).
 * Keep byte-for-byte identical canonicalization for compatibility with the frontend bridge.
 */
import { hmac } from "@noble/hashes/hmac";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { getAddress } from "ethers";

const enc = new TextEncoder();

export interface PaymentProofPayload {
  agentId: string;
  stealthAddress: string;
  amount: bigint;
  tokenSymbol: string;
  txId: string;
  /** Resource / invoice id from x402 flow */
  paymentRequestId: string;
}

function toHex0x(bytes: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(bytes)}` as const;
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac.create(sha256, key).update(data).digest();
}

/** MVP payment proof: HMAC-SHA256 over canonical payload bytes (matches stealth-contract). */
export function generatePaymentProofPayloadBytes(
  payload: PaymentProofPayload,
): Uint8Array {
  const ordered = {
    agentId: payload.agentId,
    amount: payload.amount.toString(),
    paymentRequestId: payload.paymentRequestId,
    stealthAddress: getAddress(String(payload.stealthAddress)).toLowerCase(),
    tokenSymbol: payload.tokenSymbol,
    txId: payload.txId,
  };
  return enc.encode(JSON.stringify(ordered));
}

export function generatePaymentProof(
  payload: PaymentProofPayload,
  sharedSecret: Uint8Array,
): `0x${string}` {
  const body = generatePaymentProofPayloadBytes(payload);
  const mac = hmacSha256(sharedSecret, body);
  return toHex0x(mac);
}

export function verifyPaymentProof(
  payload: PaymentProofPayload,
  sharedSecret: Uint8Array,
  proof: `0x${string}`,
): boolean {
  const expected = generatePaymentProof(payload, sharedSecret);
  return expected.toLowerCase() === proof.toLowerCase();
}
