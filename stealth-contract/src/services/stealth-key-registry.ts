import type { StealthPublicKeys } from "../crypto/types.js";

/**
 * In-memory `StealthKeyRegistry.compact` — maps agent id to published stealth public keys.
 * Swap this implementation for ledger calls; keep the public API stable.
 */
export class StealthKeyRegistry {
  private readonly byAgent = new Map<string, StealthPublicKeys>();

  register(agentId: string, keys: StealthPublicKeys): void {
    this.byAgent.set(agentId, keys);
  }

  lookup(agentId: string): StealthPublicKeys | null {
    return this.byAgent.get(agentId) ?? null;
  }

  listAll(): Array<{ agentId: string; keys: StealthPublicKeys }> {
    return [...this.byAgent.entries()].map(([agentId, keys]) => ({
      agentId,
      keys,
    }));
  }
}
