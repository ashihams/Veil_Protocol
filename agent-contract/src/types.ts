// ─── Primitive aliases mirroring Compact types ───────────────────────────────

/** 32-byte buffer — mirrors Compact Bytes<32>. Represented as a 0x-prefixed hex string. */
export type Bytes32 = `0x${string}`;

/** Agent ID — mirrors the agentCounter ledger value. First registered agent = 1n. */
export type AgentId = bigint;

// ─── Identity Registry ────────────────────────────────────────────────────────

export interface AgentRegistration {
  agentId: AgentId;
  /** SHA-256(agentURI) — what is committed on-chain. */
  uriHash: Bytes32;
  /** Raw URI kept off-chain by the TypeScript service. */
  agentURI: string;
  /** Owner public key — controls ownership-gated operations in production. */
  ownerKey: Bytes32;
  /** Payment wallet address. null = unset (maps to zero Bytes32 on-chain). */
  wallet: Bytes32 | null;
}

export interface MetadataEntry {
  /** SHA-256 of the raw string key. */
  key: Bytes32;
  /** SHA-256 of the raw value bytes. */
  valueHash: Bytes32;
  /** Raw key — kept off-chain. */
  rawKey: string;
  /** Raw value — kept off-chain. */
  rawValue: string;
}

// ─── Reputation Registry ──────────────────────────────────────────────────────

export interface FeedbackEntry {
  agentId: AgentId;
  /** Bytes32 representation of the client's public key or address. */
  clientKey: Bytes32;
  /** Sequential index per (agentId, clientKey) pair. */
  feedbackIndex: number;
  /** Numeric feedback value (e.g. 87 for 87/100, 9977 for 99.77%). */
  value: number;
  /** Decimal places for value (e.g. 2 means divide by 100). */
  valueDecimals: number;
  /** First tag — SHA-256 of the tag string or 32-byte padded raw tag. */
  tag1: Bytes32;
  /** Second tag. */
  tag2: Bytes32;
  /** SHA-256 of the service endpoint string. */
  endpointHash: Bytes32;
  /** Raw feedbackURI kept off-chain. */
  feedbackURI: string;
  /** SHA-256(feedbackURI content) — committed on-chain. */
  feedbackHash: Bytes32;
  revoked: boolean;
  /** Raw responseURI kept off-chain. null until appendResponse is called. */
  responseURI: string | null;
  /** SHA-256(responseURI content) — committed on-chain. null until appended. */
  responseHash: Bytes32 | null;
}

export interface ReputationSummary {
  count: number;
  /** Average value across matched non-revoked entries. */
  value: number;
  /** Max decimals seen across matched entries. */
  decimals: number;
}

// ─── Validation Registry ──────────────────────────────────────────────────────

export interface ValidationRequestEntry {
  requestHash: Bytes32;
  validatorKey: Bytes32;
  agentId: AgentId;
  /** Raw requestURI kept off-chain. */
  requestURI: string;
  /** SHA-256(requestURI) — committed on-chain. */
  requestUriHash: Bytes32;
  timestamp: Bytes32;
}

export interface ValidationResult {
  requestHash: Bytes32;
  validatorKey: Bytes32;
  agentId: AgentId;
  /** 0-100; -1 = pending (no response yet). */
  response: number;
  /** SHA-256(responseURI content). null until response is submitted. */
  responseHash: Bytes32 | null;
  tag: Bytes32 | null;
  lastUpdate: Bytes32;
}

export interface ValidationSummary {
  /** Number of completed (non-pending) validations matched. */
  count: number;
  /** Average response score across matched validations. */
  avgResponse: number;
}
