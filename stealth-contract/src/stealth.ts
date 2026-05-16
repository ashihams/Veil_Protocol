import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { getAddress, keccak256 } from "ethers";
import type {
  CompressedPubHex,
  GeneratedStealthKeys,
  PaymentProofPayload,
  ScannedPayment,
  StealthAddressResult,
  StealthAnnouncement,
  StealthPublicKeys,
} from "./types.js";

const CURVE_N = secp.CURVE.n;

const enc = new TextEncoder();

function bytesToBigBE(b: Uint8Array): bigint {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}

function bigIntTo32BytesBE(k: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = k;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Interpret hash / seed as a valid secp256k1 private scalar (non-zero mod n). */
export function normalizeToPrivateScalar(seed: Uint8Array): Uint8Array {
  let s = seed;
  for (let i = 0; i < 512; i++) {
    const k = bytesToBigBE(s) % CURVE_N;
    if (k > 0n) return bigIntTo32BytesBE(k);
    s = sha256(s);
  }
  throw new Error("normalizeToPrivateScalar: failed to derive non-zero scalar");
}

/** h = SHA256(compress(S)) → scalar mod n for point multiply (non-zero). */
export function hashToScalar(h: Uint8Array): bigint {
  const k = bytesToBigBE(h) % CURVE_N;
  return k === 0n ? 1n : k;
}

export function pointToEthAddress(
  point: InstanceType<typeof secp.Point>,
): string {
  const uncompressed = point.toRawBytes(false);
  const digest = keccak256(uncompressed.subarray(1));
  return getAddress(`0x${digest.slice(-40)}`);
}

export function xor32(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error("xor32: expected 32-byte inputs");
  }
  const o = new Uint8Array(32);
  for (let i = 0; i < 32; i++) o[i] = a[i]! ^ b[i]!;
  return o;
}

function toHex0x(bytes: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(bytes)}` as const;
}

export function generateStealthKeys(): GeneratedStealthKeys {
  const spendPriv = normalizeToPrivateScalar(secp.utils.randomPrivateKey());
  const viewPriv = normalizeToPrivateScalar(secp.utils.randomPrivateKey());
  const spendPub = toHex0x(
    secp.getPublicKey(spendPriv, true),
  ) as CompressedPubHex;
  const viewPub = toHex0x(
    secp.getPublicKey(viewPriv, true),
  ) as CompressedPubHex;
  return { spendPriv, viewPriv, spendPub, viewPub };
}

/**
 * Deterministic keys from ECDSA signature (r||s) — hackathon setup phase.
 * Signature hex: 0x + 64 bytes r + 64 bytes s (130 chars total), or raw 128 hex.
 */
export function generateStealthKeysFromSignature(
  signatureHex: string,
): GeneratedStealthKeys {
  const hex = signatureHex.startsWith("0x")
    ? signatureHex.slice(2)
    : signatureHex;
  if (hex.length < 128) {
    throw new Error(
      "generateStealthKeysFromSignature: expected at least r||s (64 bytes)",
    );
  }
  const r = hexToBytes(hex.slice(0, 64));
  const s = hexToBytes(hex.slice(64, 128));
  const spendPriv = normalizeToPrivateScalar(
    sha256(concatBytes(enc.encode("MidnightStealth/v1/spend"), r)),
  );
  const viewPriv = normalizeToPrivateScalar(
    sha256(concatBytes(enc.encode("MidnightStealth/v1/view"), s)),
  );
  const spendPub = toHex0x(
    secp.getPublicKey(spendPriv, true),
  ) as CompressedPubHex;
  const viewPub = toHex0x(
    secp.getPublicKey(viewPriv, true),
  ) as CompressedPubHex;
  return { spendPriv, viewPriv, spendPub, viewPub };
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const o = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    o.set(p, off);
    off += p.length;
  }
  return o;
}

/**
 * Sender side: DKSAP stealth address from recipient public keys.
 */
function coerceEphemeralScalar(ephemeralPriv: Uint8Array): Uint8Array {
  const k = bytesToBigBE(ephemeralPriv) % CURVE_N;
  if (k === 0n) return normalizeToPrivateScalar(ephemeralPriv);
  return bigIntTo32BytesBE(k);
}

function parseCompressedPub(hex: CompressedPubHex): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return hexToBytes(h);
}

export function deriveStealthAddress(
  recipient: StealthPublicKeys,
  ephemeralPriv?: Uint8Array,
): StealthAddressResult {
  const r = ephemeralPriv
    ? coerceEphemeralScalar(ephemeralPriv)
    : secp.utils.randomPrivateKey();
  const R = secp.getPublicKey(r, true);
  const Rhex = toHex0x(R) as CompressedPubHex;

  const Pview = secp.Point.fromBytes(parseCompressedPub(recipient.viewPub));
  const S = Pview.multiply(bytesToBigBE(r));
  const h = sha256(S.toRawBytes(true));
  const viewTag = h[0]!;
  const hScalar = hashToScalar(h);

  const Pspend = secp.Point.fromBytes(parseCompressedPub(recipient.spendPub));
  const Pstealth = secp.Point.BASE.multiply(hScalar).add(Pspend);
  const stealthAddress = pointToEthAddress(Pstealth);
  const ciphertext = toHex0x(xor32(r, h));

  return {
    stealthAddress,
    R: Rhex,
    viewTag,
    ciphertext,
    ephemeralPriv: r,
  };
}

/**
 * Receiver side: test one announcement. Returns null if not ours.
 */
export function checkAnnouncement(
  announcement: StealthAnnouncement,
  viewPriv: Uint8Array,
  spendPub: CompressedPubHex,
  spendPriv: Uint8Array,
): ScannedPayment | null {
  const v = bytesToBigBE(viewPriv) % CURVE_N;
  if (v === 0n) return null;
  const Rpoint = secp.Point.fromBytes(parseCompressedPub(announcement.R));
  const Sprime = Rpoint.multiply(v);
  const hPrime = sha256(Sprime.toRawBytes(true));

  if (hPrime[0] !== announcement.viewTag) return null;

  const hScalar = hashToScalar(hPrime);
  const Pspend = secp.Point.fromBytes(parseCompressedPub(spendPub));
  const Pstealth = secp.Point.BASE.multiply(hScalar).add(Pspend);
  if (
    pointToEthAddress(Pstealth).toLowerCase() !==
    announcement.stealthAddress.toLowerCase()
  ) {
    return null;
  }

  const pSpend = bytesToBigBE(spendPriv) % CURVE_N;
  if (pSpend === 0n) return null;
  const stealthScalar = (hScalar + pSpend) % CURVE_N;
  const stealthPriv = bigIntTo32BytesBE(
    stealthScalar === 0n ? CURVE_N - 1n : stealthScalar,
  );

  const checkPub = secp.Point.fromPrivateKey(stealthPriv);
  if (!checkPub.equals(Pstealth)) {
    throw new Error("checkAnnouncement: internal inconsistency");
  }

  return { announcement, stealthPriv };
}

export function scanAnnouncements(
  announcements: StealthAnnouncement[],
  viewPriv: Uint8Array,
  spendPub: CompressedPubHex,
  spendPriv: Uint8Array,
): ScannedPayment[] {
  const out: ScannedPayment[] = [];
  for (const a of announcements) {
    const hit = checkAnnouncement(a, viewPriv, spendPub, spendPriv);
    if (hit) out.push(hit);
  }
  return out;
}

/** MVP payment proof: HMAC-SHA256 over canonical payload bytes */
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

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac.create(sha256, key).update(data).digest();
}
