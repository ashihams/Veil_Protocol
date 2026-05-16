/** Compressed secp256k1 public key, 0x-prefixed hex (33 bytes = 66 hex chars). */
export type CompressedPublicKeyHex = `0x${string}`;

/** 32-byte scalar / private key, 0x-prefixed hex (64 hex chars). */
export type PrivateKeyHex = `0x${string}`;

export interface StealthKeyPair {
  spendingPrivateKey: PrivateKeyHex;
  viewingPrivateKey: PrivateKeyHex;
  spendingPublicKey: CompressedPublicKeyHex;
  viewingPublicKey: CompressedPublicKeyHex;
}

export interface StealthPublicKeys {
  spendingPublicKey: CompressedPublicKeyHex;
  viewingPublicKey: CompressedPublicKeyHex;
}

export interface EphemeralKeyPair {
  privateKey: PrivateKeyHex;
  publicKey: CompressedPublicKeyHex;
}

export interface StealthAddressResult {
  stealthAddress: string;
  ephemeralPublicKey: CompressedPublicKeyHex;
  encryptedRandom: `0x${string}`;
  viewTag: number;
}

export interface StealthAnnouncement {
  stealthAddress: string;
  ephemeralPublicKey: CompressedPublicKeyHex;
  encryptedRandom: `0x${string}`;
  viewTag: number;
  amount: bigint;
  token: string;
  timestamp: number;
}

export interface ScannedPayment {
  stealthAddress: string;
  stealthPrivateKey: PrivateKeyHex;
  amount: bigint;
  token: string;
  timestamp: number;
}

export interface PaymentRequest {
  stealthAddress: string;
  amount: bigint;
  token: string;
  timestamp: number;
}

export interface PaymentProof {
  stealthAddress: string;
  txHash: `0x${string}`;
  nonce: string;
  /** Compact ECDSA (r ‖ s), 0x + 128 hex — on-chain / Compact field name. */
  attestation: `0x${string}`;
}

export interface PaymentVerification {
  valid: boolean;
  recoveredPublicKey?: CompressedPublicKeyHex;
}
