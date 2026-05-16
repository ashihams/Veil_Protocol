import type { StealthPublicKeys } from "../types.js";

/**
 * Contract-shaped API for `StealthKeyRegistry.compact` (in-memory MVP).
 */
export class StealthKeyRegistry {
  private readonly byAgent = new Map<string, StealthPublicKeys>();

  registerKeys(agentId: string, keys: StealthPublicKeys): void {
    this.byAgent.set(agentId, keys);
  }

  getKeys(agentId: string): StealthPublicKeys | undefined {
    return this.byAgent.get(agentId);
  }

  getKeysOrThrow(agentId: string): StealthPublicKeys {
    const k = this.byAgent.get(agentId);
    if (!k) throw new Error(`StealthKeyRegistry: unknown agent ${agentId}`);
    return k;
  }

  listAgentIds(): string[] {
    return [...this.byAgent.keys()];
  }
}
