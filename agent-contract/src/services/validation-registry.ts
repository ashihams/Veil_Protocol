import type { AgentId, Bytes32, ValidationRequestEntry, ValidationResult, ValidationSummary } from "../types.js";
import { sha256hex, encodeAgentId, encodeTimestamp, nowTimestamp } from "../agent-utils.js";

/**
 * In-memory MVP for ValidationRegistry.compact.
 *
 * Mirrors the on-chain ledger maps:
 *   validationAgentId, validationValidator, validationResponse,
 *   validationRespHash, validationTag, validationLastUpdate
 *
 * Storage:
 *   byHash  — Map<requestHash, ValidationResult>   (primary lookup)
 *   byAgent — Map<agentId, Set<requestHash>>        (reverse index for getSummary)
 */
export class ValidationRegistry {
  private readonly byHash = new Map<string, ValidationResult>();
  private readonly byAgent = new Map<string, Set<string>>();

  validationRequest(
    validatorKey: Bytes32,
    agentId: AgentId,
    requestURI: string,
  ): Bytes32 {
    const timestamp = nowTimestamp();
    const requestUriHash = sha256hex(requestURI);
    // requestHash mirrors the off-chain computation: SHA-256(validator ++ agentId ++ requestURI ++ timestamp)
    const requestHash = sha256hex(
      `${validatorKey}${encodeAgentId(agentId)}${requestUriHash}${timestamp}`,
    );

    if (this.byHash.has(requestHash)) {
      throw new Error(`ValidationRegistry: duplicate requestHash ${requestHash}`);
    }

    this.byHash.set(requestHash, {
      requestHash,
      validatorKey,
      agentId,
      response: -1,
      responseHash: null,
      tag: null,
      lastUpdate: timestamp,
    });

    const set = this.byAgent.get(agentId.toString()) ?? new Set<string>();
    set.add(requestHash);
    this.byAgent.set(agentId.toString(), set);

    return requestHash;
  }

  validationResponse(
    requestHash: Bytes32,
    response: number,
    responseURI: string,
    tag: Bytes32,
  ): void {
    if (response < 0 || response > 100) {
      throw new RangeError(`ValidationRegistry: response ${response} out of 0-100 range`);
    }
    const existing = this.byHash.get(requestHash);
    if (!existing) throw new Error(`ValidationRegistry: unknown requestHash ${requestHash}`);

    existing.response = response;
    existing.responseHash = sha256hex(responseURI);
    existing.tag = tag;
    existing.lastUpdate = nowTimestamp();
  }

  getValidationStatus(requestHash: Bytes32): ValidationResult | undefined {
    return this.byHash.get(requestHash);
  }

  /**
   * Aggregate validation scores for an agent.
   * Pass empty validators array to include all validators.
   * Pass zeroBytes32() as tag to skip tag filtering.
   */
  getSummary(
    agentId: AgentId,
    validators: Bytes32[],
    tag: Bytes32,
  ): ValidationSummary {
    const hashes = this.byAgent.get(agentId.toString());
    if (!hashes) return { count: 0, avgResponse: 0 };

    let count = 0;
    let total = 0;

    for (const hash of hashes) {
      const r = this.byHash.get(hash)!;
      if (r.response < 0) continue;
      if (validators.length > 0 && !validators.includes(r.validatorKey)) continue;
      if (r.tag !== tag && tag !== `0x${"00".repeat(32)}`) continue;
      count++;
      total += r.response;
    }

    return { count, avgResponse: count > 0 ? total / count : 0 };
  }

  getAgentValidations(agentId: AgentId): Bytes32[] {
    return [...(this.byAgent.get(agentId.toString()) ?? [])] as Bytes32[];
  }

  getValidatorRequests(validatorKey: Bytes32): Bytes32[] {
    return [...this.byHash.values()]
      .filter((r) => r.validatorKey === validatorKey)
      .map((r) => r.requestHash);
  }
}
