import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import type { PaymentProof } from "../crypto/types.js";
import { verifyPaymentAttestation } from "../crypto/stealth.js";

const enc = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintResourceToken(
  proof: PaymentProof,
  secret: Uint8Array,
): string {
  const header = base64UrlEncode(
    enc.encode(JSON.stringify({ alg: "HS256", typ: "STEALTH-RESOURCE" })),
  );
  const payload = base64UrlEncode(
    enc.encode(
      JSON.stringify({
        sub: proof.stealthAddress,
        tx: proof.txHash,
        jti: proof.nonce,
        iat: Math.floor(Date.now() / 1000),
      }),
    ),
  );
  const data = `${header}.${payload}`;
  const sig = hmac.create(sha256, secret).update(enc.encode(data)).digest();
  const sigPart = base64UrlEncode(sig);
  return `${data}.${sigPart}`;
}

export type VerifyAndMarkResult =
  | { valid: true; resourceToken: string }
  | { valid: false };

/**
 * In-memory `PaymentVerifier` — attestation check, replay protection, JWT-like unlock token.
 * Replace internals with Compact / ledger checks; keep `verifyAndMark`.
 */
export class PaymentVerifier {
  readonly usedProofs = new Set<string>();

  constructor(
    private readonly resourceTokenSecret: Uint8Array = enc.encode(
      "midnight-stealth-resource-token-v1",
    ),
  ) {}

  verifyAndMark(proof: PaymentProof): VerifyAndMarkResult {
    if (!verifyPaymentAttestation(proof)) {
      return { valid: false };
    }
    if (this.usedProofs.has(proof.nonce)) {
      return { valid: false };
    }
    this.usedProofs.add(proof.nonce);
    const resourceToken = mintResourceToken(proof, this.resourceTokenSecret);
    return { valid: true, resourceToken };
  }
}
