import { describe, expect, it } from "vitest";
import {
  AnnouncementStore,
  StealthKeyRegistry,
  PaymentVerifier,
  buildPaymentProof,
  checkCompactAnnouncement,
  deriveCompactStealthAddress,
  generateCompactStealthKeys,
  scanCompactAnnouncements,
  generatePaymentProof,
  verifyPaymentProof,
} from "./index.js";
import type { CompactStealthAnnouncement } from "./index.js";

describe("DKSAP stealth core (Phase 1)", () => {
  it("receiver detects own shielded announcement; stranger does not", () => {
    const alice = generateCompactStealthKeys();
    const bob = generateCompactStealthKeys();
    const registry = new StealthKeyRegistry();
    registry.register("alice", {
      spendingPublicKey: alice.spendingPublicKey,
      viewingPublicKey: alice.viewingPublicKey,
    });

    const pub = registry.lookup("alice")!;
    const derived = deriveCompactStealthAddress(pub);
    const ann: CompactStealthAnnouncement = {
      stealthAddress: derived.stealthAddress,
      ephemeralPublicKey: derived.ephemeralPublicKey,
      encryptedRandom: derived.encryptedRandom,
      viewTag: derived.viewTag,
      amount: 1_000_000n,
      token: "NIGHT",
      timestamp: 1,
    };

    const hitAlice = checkCompactAnnouncement(
      ann,
      alice.viewingPrivateKey,
      alice.spendingPublicKey,
      alice.spendingPrivateKey,
    );
    expect(hitAlice).not.toBeNull();
    expect(hitAlice!.stealthPrivateKey.startsWith("0x")).toBe(true);

    const missBob = checkCompactAnnouncement(
      ann,
      bob.viewingPrivateKey,
      bob.spendingPublicKey,
      bob.spendingPrivateKey,
    );
    expect(missBob).toBeNull();
  });

  it("view tag fast path drops unrelated announcements", () => {
    const recv = generateCompactStealthKeys();
    const d1 = deriveCompactStealthAddress({
      spendingPublicKey: recv.spendingPublicKey,
      viewingPublicKey: recv.viewingPublicKey,
    });
    const d2 = deriveCompactStealthAddress({
      spendingPublicKey: recv.spendingPublicKey,
      viewingPublicKey: recv.viewingPublicKey,
    });

    const noise: CompactStealthAnnouncement = {
      stealthAddress: d1.stealthAddress,
      ephemeralPublicKey: d1.ephemeralPublicKey,
      encryptedRandom: d1.encryptedRandom,
      viewTag: d1.viewTag,
      amount: 1n,
      token: "X",
      timestamp: 1,
    };
    const real: CompactStealthAnnouncement = {
      stealthAddress: d2.stealthAddress,
      ephemeralPublicKey: d2.ephemeralPublicKey,
      encryptedRandom: d2.encryptedRandom,
      viewTag: d2.viewTag,
      amount: 2n,
      token: "X",
      timestamp: 2,
    };

    const mixed = [{ ...noise, viewTag: 255 }, real];

    const found = scanCompactAnnouncements(
      mixed,
      recv.viewingPrivateKey,
      recv.spendingPublicKey,
      recv.spendingPrivateKey,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.timestamp).toBe(2);
  });

  it("AnnouncementStore + registry models shielded lifecycle", () => {
    const keys = generateCompactStealthKeys();
    const reg = new StealthKeyRegistry();
    reg.register("payee", {
      spendingPublicKey: keys.spendingPublicKey,
      viewingPublicKey: keys.viewingPublicKey,
    });
    const store = new AnnouncementStore();

    const payee = reg.lookup("payee")!;
    const pay = deriveCompactStealthAddress(payee);
    store.add({
      stealthAddress: pay.stealthAddress,
      ephemeralPublicKey: pay.ephemeralPublicKey,
      encryptedRandom: pay.encryptedRandom,
      viewTag: pay.viewTag,
      amount: 42n,
      token: "DEMO",
      timestamp: Date.now(),
    });

    const scanned = scanCompactAnnouncements(
      store.getAll(),
      keys.viewingPrivateKey,
      keys.spendingPublicKey,
      keys.spendingPrivateKey,
    );
    expect(scanned).toHaveLength(1);
  });

  it("legacy HMAC unlock primitive (stealth.js)", () => {
    const secret = new TextEncoder().encode("demo-provider-hmac");
    const payload = {
      agentId: "a1",
      stealthAddress: "0x0000000000000000000000000000000000000001",
      amount: 1n,
      tokenSymbol: "NIGHT",
      txId: "tx",
      paymentRequestId: "pr-1",
    };
    const proof = generatePaymentProof(payload, secret);
    expect(verifyPaymentProof(payload, secret, proof)).toBe(true);
    const bad = generatePaymentProof(
      payload,
      new TextEncoder().encode("other"),
    );
    expect(verifyPaymentProof(payload, secret, bad)).toBe(false);
  });

  it("PaymentVerifier verifyAndMark (ECDSA attestation + replay guard)", () => {
    const keys = generateCompactStealthKeys();
    const derived = deriveCompactStealthAddress({
      spendingPublicKey: keys.spendingPublicKey,
      viewingPublicKey: keys.viewingPublicKey,
    });
    const ann: CompactStealthAnnouncement = {
      stealthAddress: derived.stealthAddress,
      ephemeralPublicKey: derived.ephemeralPublicKey,
      encryptedRandom: derived.encryptedRandom,
      viewTag: derived.viewTag,
      amount: 1n,
      token: "DUST",
      timestamp: 0,
    };
    const hit = checkCompactAnnouncement(
      ann,
      keys.viewingPrivateKey,
      keys.spendingPublicKey,
      keys.spendingPrivateKey,
    );
    expect(hit).not.toBeNull();

    const proof = buildPaymentProof(
      hit!.stealthAddress,
      "0x" + "cc".repeat(32),
      "once-only-nonce",
      hit!.stealthPrivateKey,
    );
    const v = new PaymentVerifier();
    const ok = v.verifyAndMark(proof);
    expect(ok.valid).toBe(true);
    if (ok.valid) {
      expect(ok.resourceToken.length).toBeGreaterThan(10);
    }

    const replay = v.verifyAndMark(proof);
    expect(replay.valid).toBe(false);
  });
});
