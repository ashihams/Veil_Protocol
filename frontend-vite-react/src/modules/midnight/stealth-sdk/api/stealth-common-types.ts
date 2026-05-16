import {
  type StealthPrivateState,
  Stealth,
  createPrivateState,
} from '@eddalabs/stealth-contract';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

export type StealthCircuits = ImpureCircuitId<Stealth.Contract<StealthPrivateState>>;

export const StealthPrivateStateId = 'stealthPrivateState';

export type StealthProviders = MidnightProviders<
  StealthCircuits,
  typeof StealthPrivateStateId,
  StealthPrivateState
>;

export type StealthContractCls = Stealth.Contract<StealthPrivateState>;

export type DeployedStealthContract =
  | DeployedContract<StealthContractCls>
  | FoundContract<StealthContractCls>;

export type StealthUserAction = {
  increment: string | undefined;
};

export type StealthDerivedState = {
  readonly round: Stealth.Ledger['round'];
  readonly privateState: StealthPrivateState;
  readonly turns: StealthUserAction;
};

export const stealthEmptyState: StealthDerivedState = {
  round: 0n,
  privateState: createPrivateState(0),
  turns: { increment: undefined },
};
