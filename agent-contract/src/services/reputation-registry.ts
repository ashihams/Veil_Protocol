import type { AgentId, Bytes32, FeedbackEntry, ReputationSummary } from "../types.js";
import { sha256hex } from "../agent-utils.js";

/**
 * In-memory MVP for ReputationRegistry.compact.
 *
 * Mirrors the on-chain composite-key maps:
 *   feedbackValue, feedbackTag1, feedbackTag2, feedbackRevoked,
 *   feedbackHash, responseHash
 *
 * Storage: Map<agentId, Map<clientKey, FeedbackEntry[]>>
 * feedbackIndex = position in the per-client array.
 */
export class ReputationRegistry {
  private readonly feedbacks = new Map<
    string,                        // agentId.toString()
    Map<string, FeedbackEntry[]>   // clientKey → entries
  >();

  giveFeedback(
    agentId: AgentId,
    clientKey: Bytes32,
    value: number,
    valueDecimals: number,
    tag1: Bytes32,
    tag2: Bytes32,
    endpoint: string,
    feedbackURI: string,
    feedbackHash: Bytes32,
  ): number {
    const agentMap = this.getOrCreateAgentMap(agentId);
    const existing = agentMap.get(clientKey) ?? [];
    const index = existing.length;
    existing.push({
      agentId,
      clientKey,
      feedbackIndex: index,
      value,
      valueDecimals,
      tag1,
      tag2,
      endpointHash: sha256hex(endpoint),
      feedbackURI,
      feedbackHash,
      revoked: false,
      responseURI: null,
      responseHash: null,
    });
    agentMap.set(clientKey, existing);
    return index;
  }

  revokeFeedback(agentId: AgentId, clientKey: Bytes32, feedbackIndex: number): void {
    this.getEntryOrThrow(agentId, clientKey, feedbackIndex).revoked = true;
  }

  appendResponse(
    agentId: AgentId,
    clientKey: Bytes32,
    feedbackIndex: number,
    responseURI: string,
    responseHash: Bytes32,
  ): void {
    const entry = this.getEntryOrThrow(agentId, clientKey, feedbackIndex);
    entry.responseURI = responseURI;
    entry.responseHash = responseHash;
  }

  /**
   * Aggregate feedback for an agent, optionally filtered by clientKeys and tags.
   * Pass empty arrays to include all clients / skip tag filtering.
   */
  getSummary(
    agentId: AgentId,
    clientKeys: Bytes32[],
    tag1: Bytes32,
    tag2: Bytes32,
  ): ReputationSummary {
    const agentMap = this.feedbacks.get(agentId.toString());
    if (!agentMap) return { count: 0, value: 0, decimals: 0 };

    const keysToQuery = clientKeys.length > 0 ? clientKeys : [...agentMap.keys()];
    let count = 0;
    let total = 0;
    let maxDecimals = 0;

    for (const key of keysToQuery) {
      for (const e of agentMap.get(key) ?? []) {
        if (e.revoked) continue;
        if (e.tag1 !== tag1 || e.tag2 !== tag2) continue;
        count++;
        total += e.value;
        if (e.valueDecimals > maxDecimals) maxDecimals = e.valueDecimals;
      }
    }

    return { count, value: count > 0 ? total / count : 0, decimals: maxDecimals };
  }

  readFeedback(
    agentId: AgentId,
    clientKey: Bytes32,
    index: number,
  ): FeedbackEntry | undefined {
    return this.feedbacks.get(agentId.toString())?.get(clientKey)?.[index];
  }

  /** All feedback entries for an agent across all clients. */
  readAllFeedback(
    agentId: AgentId,
    clientKeys: Bytes32[],
    tag1: Bytes32,
    tag2: Bytes32,
    includeRevoked: boolean,
  ): FeedbackEntry[] {
    const agentMap = this.feedbacks.get(agentId.toString());
    if (!agentMap) return [];

    const keysToQuery = clientKeys.length > 0 ? clientKeys : [...agentMap.keys()];
    const results: FeedbackEntry[] = [];

    for (const key of keysToQuery) {
      for (const e of agentMap.get(key) ?? []) {
        if (!includeRevoked && e.revoked) continue;
        if (e.tag1 !== tag1 || e.tag2 !== tag2) continue;
        results.push(e);
      }
    }

    return results;
  }

  getLastIndex(agentId: AgentId, clientKey: Bytes32): number {
    const entries = this.feedbacks.get(agentId.toString())?.get(clientKey);
    return entries ? entries.length - 1 : -1;
  }

  getClients(agentId: AgentId): Bytes32[] {
    const agentMap = this.feedbacks.get(agentId.toString());
    return agentMap ? ([...agentMap.keys()] as Bytes32[]) : [];
  }

  private getOrCreateAgentMap(agentId: AgentId) {
    const key = agentId.toString();
    if (!this.feedbacks.has(key)) this.feedbacks.set(key, new Map());
    return this.feedbacks.get(key)!;
  }

  private getEntryOrThrow(agentId: AgentId, clientKey: Bytes32, index: number): FeedbackEntry {
    const e = this.readFeedback(agentId, clientKey, index);
    if (!e) throw new Error(`ReputationRegistry: feedback not found ${agentId}/${clientKey}/${index}`);
    return e;
  }
}
