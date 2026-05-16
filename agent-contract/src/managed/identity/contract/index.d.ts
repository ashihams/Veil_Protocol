import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  register(context: __compactRuntime.CircuitContext<PS>,
           uriHash_0: Uint8Array,
           ownerKey_0: Uint8Array,
           agentIdKey_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setAgentURI(context: __compactRuntime.CircuitContext<PS>,
              agentIdKey_0: Uint8Array,
              newUriHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setMetadata(context: __compactRuntime.CircuitContext<PS>,
              compositeKey_0: Uint8Array,
              valueHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setAgentWallet(context: __compactRuntime.CircuitContext<PS>,
                 agentIdKey_0: Uint8Array,
                 walletBytes_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unsetAgentWallet(context: __compactRuntime.CircuitContext<PS>,
                   agentIdKey_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  register(context: __compactRuntime.CircuitContext<PS>,
           uriHash_0: Uint8Array,
           ownerKey_0: Uint8Array,
           agentIdKey_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setAgentURI(context: __compactRuntime.CircuitContext<PS>,
              agentIdKey_0: Uint8Array,
              newUriHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setMetadata(context: __compactRuntime.CircuitContext<PS>,
              compositeKey_0: Uint8Array,
              valueHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  setAgentWallet(context: __compactRuntime.CircuitContext<PS>,
                 agentIdKey_0: Uint8Array,
                 walletBytes_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  unsetAgentWallet(context: __compactRuntime.CircuitContext<PS>,
                   agentIdKey_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly agentCounter: bigint;
  agentUriHash: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  agentWallet: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  agentOwner: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  metadataStore: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  readonly registrationCount: bigint;
  readonly uriUpdateCount: bigint;
  readonly metadataSetCount: bigint;
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
