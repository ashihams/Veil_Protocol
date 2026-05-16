import type { PaymentProofPayload } from "../types.js";
import { generatePaymentProof, verifyPaymentProof } from "../stealth.js";

/**
 * Validates x402 / unlock proofs (MVP: shared HMAC secret per provider).
 */
export class PaymentVerifier {
  private readonly secret: Uint8Array;

  constructor(providerSecret: Uint8Array) {
    this.secret = providerSecret;
  }

  createProof(payload: PaymentProofPayload): `0x${string}` {
    return generatePaymentProof(payload, this.secret);
  }

  verify(payload: PaymentProofPayload, proof: `0x${string}`): boolean {
    return verifyPaymentProof(payload, this.secret, proof);
  }
}
