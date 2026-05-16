import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  giveFeedback(context: __compactRuntime.CircuitContext<PS>,
               agentIdKey_0: Uint8Array,
               compositeKey_0: Uint8Array,
               encodedValue_0: Uint8Array,
               tag1_0: Uint8Array,
               tag2_0: Uint8Array,
               fbHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeFeedback(context: __compactRuntime.CircuitContext<PS>,
                 compositeKey_0: Uint8Array,
                 revokedFlag_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  appendResponse(context: __compactRuntime.CircuitContext<PS>,
                 compositeKey_0: Uint8Array,
                 respHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  giveFeedback(context: __compactRuntime.CircuitContext<PS>,
               agentIdKey_0: Uint8Array,
               compositeKey_0: Uint8Array,
               encodedValue_0: Uint8Array,
               tag1_0: Uint8Array,
               tag2_0: Uint8Array,
               fbHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeFeedback(context: __compactRuntime.CircuitContext<PS>,
                 compositeKey_0: Uint8Array,
                 revokedFlag_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  appendResponse(context: __compactRuntime.CircuitContext<PS>,
                 compositeKey_0: Uint8Array,
                 respHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  feedbackValue: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  feedbackTag1: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  feedbackTag2: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  feedbackRevoked: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  feedbackHash: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  responseHash: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  readonly newFeedbackCount: bigint;
  readonly revocationCount: bigint;
  readonly responseCount: bigint;
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
