import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  stealth_send(context: __compactRuntime.CircuitContext<PS>,
               stealth_addr_0: Uint8Array,
               amount_0: bigint,
               ephemeral_pub_0: Uint8Array,
               encrypted_random_0: Uint8Array,
               view_tag_0: Uint8Array,
               timestamp_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  stealth_send(context: __compactRuntime.CircuitContext<PS>,
               stealth_addr_0: Uint8Array,
               amount_0: bigint,
               ephemeral_pub_0: Uint8Array,
               encrypted_random_0: Uint8Array,
               view_tag_0: Uint8Array,
               timestamp_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly stealthSendCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
