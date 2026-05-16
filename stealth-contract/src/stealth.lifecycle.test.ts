import { describe, expect, it } from "vitest";
import {
  AnnouncementStore,
  checkAnnouncement,
  deriveStealthAddress,
  generatePaymentProof,
  generateStealthKeys,
  PaymentVerifier,
  scanAnnouncements,
  StealthKeyRegistry,
  verifyPaymentProof,
} from "./index.js";

describe("DKSAP stealth core (Phase 1)", () => {
  it("receiver detects own shielded announcement; stranger does not", () => {
    const alice = generateStealthKeys();
    const bob = generateStealthKeys();
    const registry = new StealthKeyRegistry();
    registry.registerKeys("alice", {
      spendPub: alice.spendPub,
      viewPub: alice.viewPub,
    });

    const derived = deriveStealthAddress(registry.getKeysOrThrow("alice"));
    const ann = {
      stealthAddress: derived.stealthAddress,
      R: derived.R,
      viewTag: derived.viewTag,
      ciphertext: derived.ciphertext,
      amount: 1_000_000n,
      tokenSymbol: "NIGHT",
      agentId: "alice",
      txId: "tx-mock-1",
    };

    const hitAlice = checkAnnouncement(
      ann,
      alice.viewPriv,
      alice.spendPub,
      alice.spendPriv,
    );
    expect(hitAlice).not.toBeNull();
    expect(hitAlice!.stealthPriv).toHaveLength(32);

    const missBob = checkAnnouncement(
      ann,
      bob.viewPriv,
      bob.spendPub,
      bob.spendPriv,
    );
    expect(missBob).toBeNull();
  });

  it("view tag fast path drops unrelated announcements", () => {
    const recv = generateStealthKeys();
    const d1 = deriveStealthAddress({
      spendPub: recv.spendPub,
      viewPub: recv.viewPub,
    });
    const d2 = deriveStealthAddress({
      spendPub: recv.spendPub,
      viewPub: recv.viewPub,
    });

    const noise = {
      stealthAddress: d1.stealthAddress,
      R: d1.R,
      viewTag: d1.viewTag,
      ciphertext: d1.ciphertext,
      amount: 1n,
      tokenSymbol: "X",
      agentId: "a",
      txId: "t1",
    };
    const real = {
      stealthAddress: d2.stealthAddress,
      R: d2.R,
      viewTag: d2.viewTag,
      ciphertext: d2.ciphertext,
      amount: 2n,
      tokenSymbol: "X",
      agentId: "a",
      txId: "t2",
    };

    const mixed = [{ ...noise, viewTag: 255 }, real];

    const found = scanAnnouncements(
      mixed,
      recv.viewPriv,
      recv.spendPub,
      recv.spendPriv,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.announcement.txId).toBe("t2");
  });

  it("AnnouncementStore + registry models shielded lifecycle", () => {
    const keys = generateStealthKeys();
    const reg = new StealthKeyRegistry();
    reg.registerKeys("payee", {
      spendPub: keys.spendPub,
      viewPub: keys.viewPub,
    });
    const store = new AnnouncementStore();

    const pay = deriveStealthAddress(reg.getKeysOrThrow("payee"));
    store.appendShielded({
      stealthAddress: pay.stealthAddress,
      R: pay.R,
      viewTag: pay.viewTag,
      ciphertext: pay.ciphertext,
      amount: 42n,
      tokenSymbol: "DEMO",
      agentId: "payee",
      txId: "zk-tx-1",
    });

    const scanned = scanAnnouncements(
      store.getAll(),
      keys.viewPriv,
      keys.spendPub,
      keys.spendPriv,
    );
    expect(scanned).toHaveLength(1);
  });

  it("payment proof verifies (x402 unlock primitive)", () => {
    const secret = new TextEncoder().encode("demo-provider-hmac");
    const v = new PaymentVerifier(secret);
    const payload = {
      agentId: "a1",
      stealthAddress: "0x0000000000000000000000000000000000000001",
      amount: 1n,
      tokenSymbol: "NIGHT",
      txId: "tx",
      paymentRequestId: "pr-1",
    };
    const proof = v.createProof(payload);
    expect(v.verify(payload, proof)).toBe(true);
    expect(verifyPaymentProof(payload, secret, proof)).toBe(true);
    const bad = generatePaymentProof(
      payload,
      new TextEncoder().encode("other"),
    );
    expect(v.verify(payload, bad)).toBe(false);
  });
});
