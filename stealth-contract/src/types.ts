/** Ephemeral pubkey R = r*G (compressed hex, 0x-prefixed) */
export type CompressedPubHex = `0x${string}`;

export interface StealthPublicKeys {
  spendPub: CompressedPubHex;
  viewPub: CompressedPubHex;
}

export interface StealthPrivateKeys {
  spendPriv: Uint8Array;
  viewPriv: Uint8Array;
}

export interface GeneratedStealthKeys extends StealthPublicKeys {
  spendPriv: Uint8Array;
  viewPriv: Uint8Array;
}

export interface StealthAddressResult {
  stealthAddress: string;
  /** Ephemeral public key R, compressed hex */
  R: CompressedPubHex;
  viewTag: number;
  /** r ⊕ h (32 bytes hex) */
  ciphertext: `0x${string}`;
  /** r (32 bytes) — keep secret in real use */
  ephemeralPriv: Uint8Array;
}

export interface StealthAnnouncement {
  stealthAddress: string;
  R: CompressedPubHex;
  viewTag: number;
  ciphertext: `0x${string}`;
  /** MVP: cleartext meta for mocks; on Midnight hide via shielded state */
  amount: bigint;
  tokenSymbol: string;
  agentId: string;
  txId: string;
}

export interface ScannedPayment {
  announcement: StealthAnnouncement;
  /** Stealth private scalar (mod n), 32-byte big-endian */
  stealthPriv: Uint8Array;
}

export interface PaymentProofPayload {
  agentId: string;
  stealthAddress: string;
  amount: bigint;
  tokenSymbol: string;
  txId: string;
  /** Resource / invoice id from x402 flow */
  paymentRequestId: string;
}
