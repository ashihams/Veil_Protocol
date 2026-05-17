import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';
import { IdentityContract, ReputationContract, ValidationContract } from '@eddalabs/agent-contract';
import type { AgentPrivateState } from '@eddalabs/agent-contract';

// ── Identity ──────────────────────────────────────────────────────────────────

export type IdentityCircuits = ImpureCircuitId<IdentityContract.Contract<AgentPrivateState>>;
export const IdentityPrivateStateId = 'identityPrivateState' as const;
export type IdentityProviders = MidnightProviders<IdentityCircuits, typeof IdentityPrivateStateId, AgentPrivateState>;
export type DeployedIdentityContract =
  | DeployedContract<IdentityContract.Contract<AgentPrivateState>>
  | FoundContract<IdentityContract.Contract<AgentPrivateState>>;

// ── Reputation ────────────────────────────────────────────────────────────────

export type ReputationCircuits = ImpureCircuitId<ReputationContract.Contract<AgentPrivateState>>;
export const ReputationPrivateStateId = 'reputationPrivateState' as const;
export type ReputationProviders = MidnightProviders<ReputationCircuits, typeof ReputationPrivateStateId, AgentPrivateState>;
export type DeployedReputationContract =
  | DeployedContract<ReputationContract.Contract<AgentPrivateState>>
  | FoundContract<ReputationContract.Contract<AgentPrivateState>>;

// ── Validation ────────────────────────────────────────────────────────────────

export type ValidationCircuits = ImpureCircuitId<ValidationContract.Contract<AgentPrivateState>>;
export const ValidationPrivateStateId = 'validationPrivateState' as const;
export type ValidationProviders = MidnightProviders<ValidationCircuits, typeof ValidationPrivateStateId, AgentPrivateState>;
export type DeployedValidationContract =
  | DeployedContract<ValidationContract.Contract<AgentPrivateState>>
  | FoundContract<ValidationContract.Contract<AgentPrivateState>>;
