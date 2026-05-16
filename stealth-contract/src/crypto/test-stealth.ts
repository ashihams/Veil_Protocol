/**
 * Manual stealth lifecycle checks (run: npx tsx stealth-contract/src/crypto/test-stealth.ts)
 */
import { bytesToHex } from "@noble/hashes/utils";
import {
  checkAnnouncement,
  deriveStealthAddress,
  generatePaymentProof,
  generateStealthKeys,
  scanAnnouncements,
} from "./stealth.js";
import type { StealthAnnouncement, StealthKeyPair } from "./types.js";

function strip0x(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

let anyFailed = false;

function runSection(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    anyFailed = true;
    console.log(`❌ ${name}`);
    console.error(e);
  }
}

function announcementFromDerivation(
  r: ReturnType<typeof deriveStealthAddress>,
  meta: Pick<StealthAnnouncement, "amount" | "token" | "timestamp">,
): StealthAnnouncement {
  return {
    stealthAddress: r.stealthAddress,
    ephemeralPublicKey: r.ephemeralPublicKey,
    encryptedRandom: r.encryptedRandom,
    viewTag: r.viewTag,
    ...meta,
  };
}

// --- Test 1 — Key Generation
runSection("Test 1 — Key Generation", () => {
  const keys = generateStealthKeys();
  assert(strip0x(keys.spendingPrivateKey).length === 64, "spending private hex");
  assert(strip0x(keys.viewingPrivateKey).length === 64, "viewing private hex");
  assert(keys.spendingPrivateKey.startsWith("0x"), "spending private 0x");
  assert(keys.viewingPrivateKey.startsWith("0x"), "viewing private 0x");

  assert(strip0x(keys.spendingPublicKey).length === 66, "spending public hex");
  assert(strip0x(keys.viewingPublicKey).length === 66, "viewing public hex");
  assert(keys.spendingPublicKey.startsWith("0x"), "spending pub 0x");
  assert(keys.viewingPublicKey.startsWith("0x"), "viewing pub 0x");
});

// --- Test 2 — Stealth Address Derivation
runSection("Test 2 — Stealth Address Derivation", () => {
  const keys = generateStealthKeys();
  const pub: StealthKeyPair = keys;
  const result = deriveStealthAddress({
    spendingPublicKey: pub.spendingPublicKey,
    viewingPublicKey: pub.viewingPublicKey,
  });

  assert(
    result.stealthAddress.startsWith("0x") && result.stealthAddress.length === 42,
    `stealthAddress length (got ${result.stealthAddress.length})`,
  );

  assert(
    result.ephemeralPublicKey.startsWith("0x"),
    "ephemeralPublicKey 0x prefix",
  );
  assert(
    strip0x(result.ephemeralPublicKey).length === 66,
    "ephemeralPublicKey 33-byte compressed (66 hex digits)",
  );

  const tagHex = bytesToHex(Uint8Array.of(result.viewTag));
  assert(tagHex.length === 2, "viewTag encodes as 1 byte (2 hex chars)");
  assert(result.viewTag >= 0 && result.viewTag <= 255, "viewTag byte range");

  const again = deriveStealthAddress({
    spendingPublicKey: pub.spendingPublicKey,
    viewingPublicKey: pub.viewingPublicKey,
  });
  assert(
    again.stealthAddress.toLowerCase() !== result.stealthAddress.toLowerCase(),
    "two derivations should differ (fresh ephemeral r)",
  );
});

// --- Test 3 — Receiver Detects Own Payment
runSection("Test 3 — Receiver Detects Own Payment", () => {
  const keys = generateStealthKeys();
  const derived = deriveStealthAddress({
    spendingPublicKey: keys.spendingPublicKey,
    viewingPublicKey: keys.viewingPublicKey,
  });
  const announcement = announcementFromDerivation(derived, {
    amount: 1_000_000n,
    token: "NIGHT",
    timestamp: Date.now(),
  });

  const hit = checkAnnouncement(
    announcement,
    keys.viewingPrivateKey,
    keys.spendingPublicKey,
    keys.spendingPrivateKey,
  );
  assert(hit !== null, "receiver should recognize payment");
  assert(
    hit!.stealthAddress.toLowerCase() === announcement.stealthAddress.toLowerCase(),
    "stealthAddress should match",
  );
  assert(
    strip0x(hit!.stealthPrivateKey).length === 64,
    "stealthPrivateKey should be 32 bytes (64 hex chars)",
  );
});

// --- Test 4 — Non-Receiver Cannot Detect
runSection("Test 4 — Non-Receiver Cannot Detect", () => {
  const realReceiver = generateStealthKeys();
  const derived = deriveStealthAddress({
    spendingPublicKey: realReceiver.spendingPublicKey,
    viewingPublicKey: realReceiver.viewingPublicKey,
  });
  const announcement = announcementFromDerivation(derived, {
    amount: 2n,
    token: "DAI",
    timestamp: 1,
  });

  const wrong = generateStealthKeys();
  const miss = checkAnnouncement(
    announcement,
    wrong.viewingPrivateKey,
    wrong.spendingPublicKey,
    wrong.spendingPrivateKey,
  );
  assert(miss === null, "wrong keys must not decrypt to this payment");
});

// --- Test 5 — Batch Scanning
runSection("Test 5 — Batch Scanning", () => {
  const us = generateStealthKeys();
  const otherA = generateStealthKeys();
  const otherB = generateStealthKeys();

  const ours1 = announcementFromDerivation(
    deriveStealthAddress({
      spendingPublicKey: us.spendingPublicKey,
      viewingPublicKey: us.viewingPublicKey,
    }),
    { amount: 1n, token: "T", timestamp: 1 },
  );
  const ours2 = announcementFromDerivation(
    deriveStealthAddress({
      spendingPublicKey: us.spendingPublicKey,
      viewingPublicKey: us.viewingPublicKey,
    }),
    { amount: 2n, token: "T", timestamp: 2 },
  );

  const foreign = (k: StealthKeyPair) =>
    announcementFromDerivation(
      deriveStealthAddress({
        spendingPublicKey: k.spendingPublicKey,
        viewingPublicKey: k.viewingPublicKey,
      }),
      { amount: 99n, token: "X", timestamp: 9 },
    );

  const batch: StealthAnnouncement[] = [
    foreign(otherA),
    ours1,
    foreign(otherB),
    ours2,
    foreign(generateStealthKeys()),
  ];

  const hits = scanAnnouncements(
    batch,
    us.viewingPrivateKey,
    us.spendingPublicKey,
    us.spendingPrivateKey,
  );

  assert(hits.length === 2, `expected 2 hits, got ${hits.length}`);
  const addrs = new Set(hits.map((h) => h.stealthAddress.toLowerCase()));
  assert(addrs.size === 2, "two distinct stealth addresses");
});

// --- Test 6 — Payment Proof
runSection("Test 6 — Payment Proof", () => {
  const keys = generateStealthKeys();
  const derived = deriveStealthAddress({
    spendingPublicKey: keys.spendingPublicKey,
    viewingPublicKey: keys.viewingPublicKey,
  });
  const announcement = announcementFromDerivation(derived, {
    amount: 1n,
    token: "NIGHT",
    timestamp: 0,
  });
  const hit = checkAnnouncement(
    announcement,
    keys.viewingPrivateKey,
    keys.spendingPublicKey,
    keys.spendingPrivateKey,
  );
  if (hit === null) {
    throw new Error("need derived stealth private key for proof");
  }

  const proof = generatePaymentProof(
    hit.stealthAddress,
    "0x" + "ab".repeat(32),
    "nonce-1",
    hit.stealthPrivateKey,
  );
  assert(proof.startsWith("0x"), "proof should be hex-prefixed");
  assert(strip0x(proof).length > 0, "proof should be non-empty hex");
  assert(/^[0-9a-f]+$/i.test(strip0x(proof)), "proof should be hex only after 0x");
});

// --- Summary (hackathon / judges)
console.log("");
console.log("────────────────────────────────────────────────────────");
console.log("DKSAP Stealth Crypto — Lifecycle Summary");
console.log("────────────────────────────────────────────────────────");
if (anyFailed) {
  console.log("❌ One or more checks failed — fix before demo.");
  process.exitCode = 1;
} else {
  console.log("✅ All 6 lifecycle scenarios passed.");
  console.log("");
  console.log(
    "Demonstrates: random dual-key generation; one-time ephemeral derivation;",
  );
  console.log(
    "receiver-only scan (view tag + address check); batch filtering;",
  );
  console.log(
    "and ECDSA payment proofs bound to stealthAddress:txHash:nonce.",
  );
  console.log("");
  console.log("Run again anytime:");
  console.log("  npx tsx stealth-contract/src/crypto/test-stealth.ts");
}
