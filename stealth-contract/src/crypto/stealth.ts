import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type {
  PaymentProof,
  PrivateKeyHex,
  ScannedPayment,
  StealthAddressResult,
  StealthAnnouncement,
  StealthKeyPair,
  StealthPublicKeys,
} from "./types.js";

secp.etc.hmacSha256Sync = (k, ...m) => {
  const digest = hmac.create(sha256, k);
  m.forEach((b) => digest.update(b));
  return digest.digest();
};

const enc = new TextEncoder();
const order = secp.CURVE.n;

function strip0x(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

function to0xHex(bytes: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(bytes)}`;
}

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

/** Last 20 bytes of SHA256(uncompressed P) — exported for payment verification. */
export function stealthAddressFromPublicPoint(
  p: InstanceType<typeof secp.ProjectivePoint>,
): string {
  const uncompressed = p.toRawBytes(false);
  const digest = sha256(uncompressed);
  const addrBytes = digest.subarray(12);
  return to0xHex(addrBytes).toLowerCase();
}

function xor32(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== 32 || b.length !== 32) {
    throw new Error("xor32: expected two 32-byte inputs");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = a[i]! ^ b[i]!;
  return out;
}

function scalarMulG(hScalar: bigint): InstanceType<typeof secp.ProjectivePoint> {
  const s = ((hScalar % order) + order) % order;
  if (s === 0n) return secp.ProjectivePoint.ZERO;
  return secp.ProjectivePoint.BASE.multiply(s);
}

export function generateStealthKeys(): StealthKeyPair {
  const pSpend = secp.utils.randomPrivateKey();
  const pView = secp.utils.randomPrivateKey();

  const spendingPublicKey = to0xHex(
    secp.getPublicKey(pSpend, true),
  ) as StealthKeyPair["spendingPublicKey"];
  const viewingPublicKey = to0xHex(
    secp.getPublicKey(pView, true),
  ) as StealthKeyPair["viewingPublicKey"];

  return {
    spendingPrivateKey: to0xHex(pSpend) as StealthKeyPair["spendingPrivateKey"],
    viewingPrivateKey: to0xHex(pView) as StealthKeyPair["viewingPrivateKey"],
    spendingPublicKey,
    viewingPublicKey,
  };
}

export function deriveStealthAddress(
  recipientKeys: StealthPublicKeys,
): StealthAddressResult {
  const r = secp.utils.randomPrivateKey();
  const Rcompressed = secp.getPublicKey(r, true);
  const ephemeralPublicKey = to0xHex(
    Rcompressed,
  ) as StealthAddressResult["ephemeralPublicKey"];

  const S = secp.getSharedSecret(
    r,
    hexToBytes(strip0x(recipientKeys.viewingPublicKey)),
    true,
  );
  const h = sha256(S);
  const viewTag = h[0]!;
  const hInt = bytesToBigBE(h);
  const hScalar = hInt % order;

  const pSpend = secp.ProjectivePoint.fromHex(
    strip0x(recipientKeys.spendingPublicKey),
  );
  const hG = scalarMulG(hScalar);
  const pStealth = hG.add(pSpend);

  const stealthAddress = stealthAddressFromPublicPoint(pStealth);
  const encryptedRandom = to0xHex(xor32(r, h));

  return {
    stealthAddress,
    ephemeralPublicKey,
    encryptedRandom,
    viewTag,
  };
}

export function checkAnnouncement(
  announcement: StealthAnnouncement,
  viewingPrivateKey: StealthKeyPair["viewingPrivateKey"],
  spendingPublicKey: StealthPublicKeys["spendingPublicKey"],
  spendingPrivateKey: StealthKeyPair["spendingPrivateKey"],
): ScannedPayment | null {
  const pViewBytes = hexToBytes(strip0x(viewingPrivateKey));
  const pSpendBytes = hexToBytes(strip0x(spendingPrivateKey));

  const Sprime = secp.getSharedSecret(
    pViewBytes,
    hexToBytes(strip0x(announcement.ephemeralPublicKey)),
    true,
  );
  const hPrime = sha256(Sprime);

  if (hPrime[0] !== announcement.viewTag) return null;

  const hInt = bytesToBigBE(hPrime);
  const hScalar = hInt % order;

  const pSpend = secp.ProjectivePoint.fromHex(
    strip0x(spendingPublicKey),
  );
  const pStealth = scalarMulG(hScalar).add(pSpend);

  const recomputed = stealthAddressFromPublicPoint(pStealth);
  if (recomputed.toLowerCase() !== announcement.stealthAddress.toLowerCase()) {
    return null;
  }

  const pSpendInt = BigInt(`0x${bytesToHex(pSpendBytes)}`);
  const stealthPrivInt = (hInt + pSpendInt) % order;

  if (stealthPrivInt === 0n) return null;

  const stealthPrivateKey = to0xHex(
    bigIntTo32BytesBE(stealthPrivInt),
  ) as ScannedPayment["stealthPrivateKey"];

  const pub = secp.ProjectivePoint.fromPrivateKey(
    hexToBytes(strip0x(stealthPrivateKey)),
  );
  if (!pub.equals(pStealth)) return null;

  return {
    stealthAddress: announcement.stealthAddress,
    stealthPrivateKey,
    amount: announcement.amount,
    token: announcement.token,
    timestamp: announcement.timestamp,
  };
}

export function scanAnnouncements(
  announcements: StealthAnnouncement[],
  viewingPrivateKey: StealthKeyPair["viewingPrivateKey"],
  spendingPublicKey: StealthPublicKeys["spendingPublicKey"],
  spendingPrivateKey: StealthKeyPair["spendingPrivateKey"],
): ScannedPayment[] {
  const out: ScannedPayment[] = [];
  for (const a of announcements) {
    const hit = checkAnnouncement(
      a,
      viewingPrivateKey,
      spendingPublicKey,
      spendingPrivateKey,
    );
    if (hit) out.push(hit);
  }
  return out;
}

export function generatePaymentProof(
  stealthAddress: string,
  txHash: string,
  nonce: string,
  stealthPrivateKey: PrivateKeyHex,
): string {
  const msg = enc.encode(`${stealthAddress}:${txHash}:${nonce}`);
  const messageHash = sha256(msg);
  const sig = secp.sign(
    messageHash,
    hexToBytes(strip0x(stealthPrivateKey)),
  );
  return `0x${sig.toCompactHex()}`;
}

/** Verify ECDSA attestation against the canonical stealth payment message. */
export function verifyPaymentAttestation(proof: PaymentProof): boolean {
  const msg = enc.encode(
    `${proof.stealthAddress}:${proof.txHash}:${proof.nonce}`,
  );
  const messageHash = sha256(msg);
  const compact = strip0x(proof.attestation);
  if (compact.length !== 128) return false;
  let sig: InstanceType<typeof secp.Signature>;
  try {
    sig = secp.Signature.fromCompact(compact);
  } catch {
    return false;
  }
  for (let rec = 0; rec < 4; rec++) {
    try {
      const withRec = sig.addRecoveryBit(rec);
      const pub = withRec.recoverPublicKey(messageHash);
      const addr = stealthAddressFromPublicPoint(pub);
      if (addr.toLowerCase() === proof.stealthAddress.toLowerCase()) {
        return secp.verify(sig, messageHash, pub.toRawBytes(true));
      }
    } catch {
      continue;
    }
  }
  return false;
}

function normalizeTxHash(txHash: string): string {
  const t = txHash.trim();
  return t.startsWith("0x") || t.startsWith("0X") ? t : `0x${t}`;
}

/** Full proof object for `PaymentVerifier` / Compact `PaymentProof` record. */
export function buildPaymentProof(
  stealthAddress: string,
  txHash: string,
  nonce: string,
  stealthPrivateKey: PrivateKeyHex,
): PaymentProof {
  const th = normalizeTxHash(txHash) as PaymentProof["txHash"];
  return {
    stealthAddress,
    txHash: th,
    nonce,
    attestation: generatePaymentProof(
      stealthAddress,
      th,
      nonce,
      stealthPrivateKey,
    ) as PaymentProof["attestation"],
  };
}
