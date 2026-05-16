/** Private state carried by the agent contract client. MVP has no private state. */
export type AgentPrivateState = {
  privateCounter: number;
};

export const createPrivateState = (value: number): AgentPrivateState => ({
  privateCounter: value,
});

/**
 * Witnesses object passed to the Contract constructor.
 *
 * Production paths will extend this with ownership proof witnesses, e.g.:
 *   ownerProof: (context, agentId) => signWithOwnerKey(agentId)
 *
 * See contracts/IdentityRegistry.compact for the full production design.
 */
export const witnesses = {};
