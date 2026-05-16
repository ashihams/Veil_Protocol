import type { AgentId, AgentRegistration, Bytes32, MetadataEntry } from "../types.js";
import { sha256hex, compositeKey, zeroBytes32 } from "../agent-utils.js";

/**
 * In-memory MVP for IdentityRegistry.compact.
 *
 * Mirrors the on-chain ledger maps:
 *   agentCounter   → nextId
 *   agentUriHash   → registration.uriHash (key: agentIdKey = SHA-256 UTF-8 decimal id)
 *   agentOwner     → registration.ownerKey
 *   agentWallet    → registration.wallet
 *   metadataStore  → metadata map (compositeKey → MetadataEntry)
 */
export class IdentityRegistry {
  private nextId: bigint = 0n;
  private readonly byId = new Map<string, AgentRegistration>();
  private readonly metadata = new Map<string, MetadataEntry>();

  register(agentURI: string, ownerKey: Bytes32): AgentId {
    this.nextId += 1n;
    const id = this.nextId;
    this.byId.set(id.toString(), {
      agentId: id,
      uriHash: sha256hex(agentURI),
      agentURI,
      ownerKey,
      wallet: null,
    });
    return id;
  }

  setAgentURI(agentId: AgentId, newURI: string): void {
    const entry = this.getOrThrow(agentId);
    entry.uriHash = sha256hex(newURI);
    entry.agentURI = newURI;
  }

  getMetadata(agentId: AgentId, key: string): MetadataEntry | undefined {
    return this.metadata.get(compositeKey(agentId, key));
  }

  setMetadata(agentId: AgentId, key: string, value: string): void {
    this.metadata.set(compositeKey(agentId, key), {
      key: sha256hex(key),
      valueHash: sha256hex(value),
      rawKey: key,
      rawValue: value,
    });
  }

  setAgentWallet(agentId: AgentId, wallet: Bytes32): void {
    this.getOrThrow(agentId).wallet = wallet;
  }

  getAgentWallet(agentId: AgentId): Bytes32 | null {
    const w = this.getOrThrow(agentId).wallet;
    return w === zeroBytes32() ? null : w;
  }

  unsetAgentWallet(agentId: AgentId): void {
    this.getOrThrow(agentId).wallet = null;
  }

  getRegistration(agentId: AgentId): AgentRegistration | undefined {
    return this.byId.get(agentId.toString());
  }

  listAgentIds(): AgentId[] {
    return [...this.byId.keys()].map(BigInt);
  }

  private getOrThrow(agentId: AgentId): AgentRegistration {
    const r = this.byId.get(agentId.toString());
    if (!r) throw new Error(`IdentityRegistry: unknown agentId ${agentId}`);
    return r;
  }
}
