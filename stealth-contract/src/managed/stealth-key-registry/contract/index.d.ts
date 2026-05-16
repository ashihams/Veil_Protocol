import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  register_keys(context: __compactRuntime.CircuitContext<PS>,
                agentIdHash_0: Uint8Array,
                spendPub_0: Uint8Array,
                viewPub_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  lookup_keys(context: __compactRuntime.CircuitContext<PS>,
              agentIdHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, { spendPub: Uint8Array,
                                                                                viewPub: Uint8Array
                                                                              }>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  register_keys(context: __compactRuntime.CircuitContext<PS>,
                agentIdHash_0: Uint8Array,
                spendPub_0: Uint8Array,
                viewPub_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  lookup_keys(context: __compactRuntime.CircuitContext<PS>,
              agentIdHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, { spendPub: Uint8Array,
                                                                                viewPub: Uint8Array
                                                                              }>;
}

export type Ledger = {
  stealthKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { spendPub: Uint8Array, viewPub: Uint8Array };
    [Symbol.iterator](): Iterator<[Uint8Array, { spendPub: Uint8Array, viewPub: Uint8Array }]>
  };
  readonly registrationCount: bigint;
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
