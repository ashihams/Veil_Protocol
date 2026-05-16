import { sha256hex } from "./agent-utils.js";
import type { Bytes32 } from "./types.js";

// ─── ERC-8004 Agent Metadata schema ──────────────────────────────────────────
// This is the JSON document resolved by agentURI.
// SHA-256 of the canonical JSON is committed on-chain as uriHash.

export interface AgentService {
  /** Service type: "web" | "A2A" | "MCP" | "OASF" | "ENS" | "DID" | "email" */
  name: string;
  endpoint: string;
  version?: string;
  /** OASF skill identifiers */
  skills?: string[];
  /** OASF domain classifications */
  domains?: string[];
}

export interface AgentRegistrationRef {
  /** CAIP-2 chain identifier, e.g. "midnight:preview" or "eip155:1" */
  chain: string;
  /** Registry contract address on that chain */
  registry: string;
  /** agentId in that registry */
  agentId: number | bigint;
}

export interface AgentMetadata {
  $schema: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

  /** Human-readable agent name */
  name: string;
  /** Natural-language description — what it does, pricing, interaction methods */
  description: string;
  /** URL to agent avatar / logo */
  image?: string;
  /** Whether this agent is currently accepting work */
  active: boolean;
  /** Whether this agent accepts x402 payment-gated requests */
  x402Support: boolean;

  /** Advertised service endpoints */
  services: AgentService[];

  /** Cross-chain registry references */
  registrations?: AgentRegistrationRef[];

  /** Trust mechanisms supported: "reputation" | "crypto-economic" | "tee-attestation" */
  supportedTrust?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Serialise AgentMetadata to canonical JSON (sorted keys, no extra whitespace).
 * Use this when computing the uriHash that is committed on-chain.
 */
export function serializeAgentMetadata(meta: AgentMetadata): string {
  return JSON.stringify(meta, Object.keys(meta).sort());
}

/**
 * Compute the Bytes32 uriHash for an AgentMetadata document.
 * Pass this value to IdentityRegistry.register() or setAgentURI().
 */
export function hashAgentMetadata(meta: AgentMetadata): Bytes32 {
  return sha256hex(serializeAgentMetadata(meta));
}

/**
 * Convenience constructor — fills required fields and returns a valid AgentMetadata.
 */
export function createAgentMetadata(
  opts: Pick<AgentMetadata, "name" | "description" | "services"> &
    Partial<Omit<AgentMetadata, "name" | "description" | "services" | "$schema" | "type">>,
): AgentMetadata {
  return {
    $schema: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    active: true,
    x402Support: false,
    ...opts,
  };
}
