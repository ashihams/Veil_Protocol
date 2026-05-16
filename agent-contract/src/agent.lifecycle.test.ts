import { describe, it, expect, beforeEach } from "vitest";
import { IdentityRegistry } from "./services/identity-registry.js";
import { ReputationRegistry } from "./services/reputation-registry.js";
import { ValidationRegistry } from "./services/validation-registry.js";
import { zeroBytes32, sha256hex } from "./agent-utils.js";
import type { Bytes32 } from "./types.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const OWNER_KEY: Bytes32 = `0x${"ab".repeat(32)}`;
const CLIENT_KEY: Bytes32 = `0x${"cd".repeat(32)}`;
const VALIDATOR_KEY: Bytes32 = `0x${"ef".repeat(32)}`;
const TAG1: Bytes32 = sha256hex("quality");
const TAG2: Bytes32 = sha256hex("response-time");
const ZERO = zeroBytes32();

// ─── IdentityRegistry ─────────────────────────────────────────────────────────

describe("IdentityRegistry", () => {
  let registry: IdentityRegistry;

  beforeEach(() => {
    registry = new IdentityRegistry();
  });

  it("assigns sequential agentIds starting at 1", () => {
    const id1 = registry.register("https://agent.example/1.json", OWNER_KEY);
    const id2 = registry.register("https://agent.example/2.json", OWNER_KEY);
    expect(id1).toBe(1n);
    expect(id2).toBe(2n);
  });

  it("stores uriHash as SHA-256 of the agentURI", () => {
    const uri = "https://agent.example/alice.json";
    const id = registry.register(uri, OWNER_KEY);
    const reg = registry.getRegistration(id)!;
    expect(reg.uriHash).toBe(sha256hex(uri));
    expect(reg.agentURI).toBe(uri);
  });

  it("setAgentURI updates the uri hash and raw URI", () => {
    const id = registry.register("https://agent.example/old.json", OWNER_KEY);
    const newURI = "https://agent.example/new.json";
    registry.setAgentURI(id, newURI);
    const reg = registry.getRegistration(id)!;
    expect(reg.agentURI).toBe(newURI);
    expect(reg.uriHash).toBe(sha256hex(newURI));
  });

  it("setMetadata / getMetadata round-trips key-value pairs", () => {
    const id = registry.register("https://agent.example/bob.json", OWNER_KEY);
    registry.setMetadata(id, "model", "claude-opus-4-7");
    const entry = registry.getMetadata(id, "model")!;
    expect(entry.rawKey).toBe("model");
    expect(entry.rawValue).toBe("claude-opus-4-7");
    expect(entry.valueHash).toBe(sha256hex("claude-opus-4-7"));
  });

  it("setMetadata overwrites an existing key", () => {
    const id = registry.register("https://agent.example/bob.json", OWNER_KEY);
    registry.setMetadata(id, "version", "1");
    registry.setMetadata(id, "version", "2");
    expect(registry.getMetadata(id, "version")!.rawValue).toBe("2");
  });

  it("getMetadata returns undefined for an unknown key", () => {
    const id = registry.register("https://agent.example/bob.json", OWNER_KEY);
    expect(registry.getMetadata(id, "missing")).toBeUndefined();
  });

  it("setAgentWallet / getAgentWallet / unsetAgentWallet lifecycle", () => {
    const id = registry.register("https://agent.example/carol.json", OWNER_KEY);
    const wallet: Bytes32 = `0x${"11".repeat(32)}`;

    expect(registry.getAgentWallet(id)).toBeNull();
    registry.setAgentWallet(id, wallet);
    expect(registry.getAgentWallet(id)).toBe(wallet);
    registry.unsetAgentWallet(id);
    expect(registry.getAgentWallet(id)).toBeNull();
  });

  it("listAgentIds returns all registered ids", () => {
    registry.register("https://a.example/1.json", OWNER_KEY);
    registry.register("https://a.example/2.json", OWNER_KEY);
    registry.register("https://a.example/3.json", OWNER_KEY);
    expect(registry.listAgentIds().sort()).toEqual([1n, 2n, 3n]);
  });

  it("throws on operations for an unknown agentId", () => {
    expect(() => registry.setAgentURI(99n, "x")).toThrow("unknown agentId");
    expect(() => registry.setAgentWallet(99n, ZERO)).toThrow("unknown agentId");
    expect(() => registry.unsetAgentWallet(99n)).toThrow("unknown agentId");
  });
});

// ─── ReputationRegistry ───────────────────────────────────────────────────────

describe("ReputationRegistry", () => {
  let registry: ReputationRegistry;

  beforeEach(() => {
    registry = new ReputationRegistry();
  });

  it("giveFeedback assigns sequential indexes per client", () => {
    const idx0 = registry.giveFeedback(1n, CLIENT_KEY, 87, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("content1"));
    const idx1 = registry.giveFeedback(1n, CLIENT_KEY, 92, 0, TAG1, TAG2, "https://svc", "https://fb/2", sha256hex("content2"));
    expect(idx0).toBe(0);
    expect(idx1).toBe(1);
  });

  it("different clients maintain independent indexes", () => {
    const OTHER_CLIENT: Bytes32 = `0x${"ee".repeat(32)}`;
    registry.giveFeedback(1n, CLIENT_KEY, 80, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c1"));
    const idx = registry.giveFeedback(1n, OTHER_CLIENT, 90, 0, TAG1, TAG2, "https://svc", "https://fb/2", sha256hex("c2"));
    expect(idx).toBe(0);
  });

  it("readFeedback returns the correct entry", () => {
    registry.giveFeedback(1n, CLIENT_KEY, 75, 2, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c"));
    const entry = registry.readFeedback(1n, CLIENT_KEY, 0)!;
    expect(entry.value).toBe(75);
    expect(entry.valueDecimals).toBe(2);
    expect(entry.revoked).toBe(false);
  });

  it("revokeFeedback marks entry revoked; getSummary excludes it", () => {
    registry.giveFeedback(1n, CLIENT_KEY, 100, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c"));
    registry.revokeFeedback(1n, CLIENT_KEY, 0);
    expect(registry.readFeedback(1n, CLIENT_KEY, 0)!.revoked).toBe(true);
    const summary = registry.getSummary(1n, [], TAG1, TAG2);
    expect(summary.count).toBe(0);
  });

  it("getSummary averages values filtered by tag", () => {
    registry.giveFeedback(1n, CLIENT_KEY, 80, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c1"));
    registry.giveFeedback(1n, CLIENT_KEY, 60, 0, TAG1, TAG2, "https://svc", "https://fb/2", sha256hex("c2"));
    // Different tags — should not be included
    const OTHER_TAG: Bytes32 = sha256hex("latency");
    registry.giveFeedback(1n, CLIENT_KEY, 10, 0, OTHER_TAG, TAG2, "https://svc", "https://fb/3", sha256hex("c3"));

    const summary = registry.getSummary(1n, [], TAG1, TAG2);
    expect(summary.count).toBe(2);
    expect(summary.value).toBe(70);
  });

  it("getSummary filters by specific clientKeys", () => {
    const OTHER_CLIENT: Bytes32 = `0x${"ff".repeat(32)}`;
    registry.giveFeedback(1n, CLIENT_KEY, 100, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c1"));
    registry.giveFeedback(1n, OTHER_CLIENT, 0, 0, TAG1, TAG2, "https://svc", "https://fb/2", sha256hex("c2"));

    const summary = registry.getSummary(1n, [CLIENT_KEY], TAG1, TAG2);
    expect(summary.count).toBe(1);
    expect(summary.value).toBe(100);
  });

  it("appendResponse attaches to the correct feedback entry", () => {
    registry.giveFeedback(1n, CLIENT_KEY, 90, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c"));
    registry.appendResponse(1n, CLIENT_KEY, 0, "https://response/1", sha256hex("resp"));
    const entry = registry.readFeedback(1n, CLIENT_KEY, 0)!;
    expect(entry.responseURI).toBe("https://response/1");
    expect(entry.responseHash).toBe(sha256hex("resp"));
  });

  it("getLastIndex returns -1 for unknown client", () => {
    expect(registry.getLastIndex(1n, CLIENT_KEY)).toBe(-1);
  });

  it("getLastIndex returns correct index after feedback", () => {
    registry.giveFeedback(1n, CLIENT_KEY, 80, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c1"));
    registry.giveFeedback(1n, CLIENT_KEY, 90, 0, TAG1, TAG2, "https://svc", "https://fb/2", sha256hex("c2"));
    expect(registry.getLastIndex(1n, CLIENT_KEY)).toBe(1);
  });

  it("getClients returns all clients for an agent", () => {
    const OTHER_CLIENT: Bytes32 = `0x${"aa".repeat(32)}`;
    registry.giveFeedback(1n, CLIENT_KEY, 80, 0, TAG1, TAG2, "https://svc", "https://fb/1", sha256hex("c1"));
    registry.giveFeedback(1n, OTHER_CLIENT, 90, 0, TAG1, TAG2, "https://svc", "https://fb/2", sha256hex("c2"));
    expect(registry.getClients(1n).sort()).toEqual([CLIENT_KEY, OTHER_CLIENT].sort());
  });

  it("throws on revoke / appendResponse for unknown feedback", () => {
    expect(() => registry.revokeFeedback(1n, CLIENT_KEY, 0)).toThrow("feedback not found");
    expect(() => registry.appendResponse(1n, CLIENT_KEY, 0, "x", sha256hex("x"))).toThrow("feedback not found");
  });
});

// ─── ValidationRegistry ───────────────────────────────────────────────────────

describe("ValidationRegistry", () => {
  let registry: ValidationRegistry;

  beforeEach(() => {
    registry = new ValidationRegistry();
  });

  it("validationRequest creates a pending entry and returns requestHash", () => {
    const hash = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    const status = registry.getValidationStatus(hash)!;
    expect(status.agentId).toBe(1n);
    expect(status.validatorKey).toBe(VALIDATOR_KEY);
    expect(status.response).toBe(-1);
    expect(status.responseHash).toBeNull();
  });

  it("validationResponse updates entry with score and tag", () => {
    const hash = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    registry.validationResponse(hash, 85, "https://resp/1.json", TAG1);
    const status = registry.getValidationStatus(hash)!;
    expect(status.response).toBe(85);
    expect(status.tag).toBe(TAG1);
    expect(status.responseHash).toBe(sha256hex("https://resp/1.json"));
  });

  it("validates response is in 0-100 range", () => {
    const hash = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    expect(() => registry.validationResponse(hash, 101, "x", TAG1)).toThrow("0-100 range");
    expect(() => registry.validationResponse(hash, -1, "x", TAG1)).toThrow("0-100 range");
  });

  it("throws on validationResponse for unknown requestHash", () => {
    const fakeHash: Bytes32 = `0x${"00".repeat(32)}`;
    expect(() => registry.validationResponse(fakeHash, 50, "x", TAG1)).toThrow("unknown requestHash");
  });

  it("getSummary returns count and average for completed validations", () => {
    const h1 = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    const h2 = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/2.json");
    registry.validationResponse(h1, 80, "https://resp/1.json", TAG1);
    registry.validationResponse(h2, 60, "https://resp/2.json", TAG1);

    const summary = registry.getSummary(1n, [], TAG1);
    expect(summary.count).toBe(2);
    expect(summary.avgResponse).toBe(70);
  });

  it("getSummary excludes pending entries", () => {
    registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    const summary = registry.getSummary(1n, [], TAG1);
    expect(summary.count).toBe(0);
  });

  it("getSummary filters by validator", () => {
    const OTHER_VALIDATOR: Bytes32 = `0x${"12".repeat(32)}`;
    const h1 = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    const h2 = registry.validationRequest(OTHER_VALIDATOR, 1n, "https://req/2.json");
    registry.validationResponse(h1, 100, "https://resp/1.json", TAG1);
    registry.validationResponse(h2, 0, "https://resp/2.json", TAG1);

    const summary = registry.getSummary(1n, [VALIDATOR_KEY], TAG1);
    expect(summary.count).toBe(1);
    expect(summary.avgResponse).toBe(100);
  });

  it("getAgentValidations lists all requestHashes for an agent", () => {
    const h1 = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    const h2 = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/2.json");
    expect(registry.getAgentValidations(1n).sort()).toEqual([h1, h2].sort());
  });

  it("getValidatorRequests lists all requests from a specific validator", () => {
    const h1 = registry.validationRequest(VALIDATOR_KEY, 1n, "https://req/1.json");
    const h2 = registry.validationRequest(VALIDATOR_KEY, 2n, "https://req/2.json");
    expect(registry.getValidatorRequests(VALIDATOR_KEY).sort()).toEqual([h1, h2].sort());
  });

  it("getValidationStatus returns undefined for unknown hash", () => {
    expect(registry.getValidationStatus(`0x${"00".repeat(32)}`)).toBeUndefined();
  });
});
