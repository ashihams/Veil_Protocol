import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  validationRequest(context: __compactRuntime.CircuitContext<PS>,
                    requestHash_0: Uint8Array,
                    validatorKey_0: Uint8Array,
                    agentIdBytes_0: Uint8Array,
                    requestUriHash_0: Uint8Array,
                    timestamp_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  submitValidationResponse(context: __compactRuntime.CircuitContext<PS>,
                           requestHash_0: Uint8Array,
                           responseEncoded_0: Uint8Array,
                           responseUriHash_0: Uint8Array,
                           respHash_0: Uint8Array,
                           tag_0: Uint8Array,
                           timestamp_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  validationRequest(context: __compactRuntime.CircuitContext<PS>,
                    requestHash_0: Uint8Array,
                    validatorKey_0: Uint8Array,
                    agentIdBytes_0: Uint8Array,
                    requestUriHash_0: Uint8Array,
                    timestamp_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  submitValidationResponse(context: __compactRuntime.CircuitContext<PS>,
                           requestHash_0: Uint8Array,
                           responseEncoded_0: Uint8Array,
                           responseUriHash_0: Uint8Array,
                           respHash_0: Uint8Array,
                           tag_0: Uint8Array,
                           timestamp_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  validationAgentId: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  validationValidator: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  validationResponse: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  validationRespHash: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  validationTag: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  validationLastUpdate: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  readonly requestCount: bigint;
  readonly responseCountVal: bigint;
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
