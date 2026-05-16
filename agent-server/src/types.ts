/** Supported task operations */
export type TaskOp = "add";

/** Client request body */
export interface TaskRequest {
  op: TaskOp;
  a: number;
  b: number;
}

/** Resource descriptor (x402 v2) */
export interface ResourceInfo {
  url: string;
  description?: string;
}

/** One acceptable payment method advertised by the server */
export interface PaymentRequirements {
  scheme: "midnight-hmac";
  network: "midnight:preview";
  /** Amount in DUST atomic units (string to avoid bigint serialisation issues) */
  amount: string;
  asset: "DUST";
  /** Server wallet receiving the payment */
  payTo: string;
  maxTimeoutSeconds: number;
}

/** Server → Client: 402 challenge body (mirrors x402 v2 PaymentRequired) */
export interface PaymentRequired {
  x402Version: 2;
  error: string;
  resource: ResourceInfo;
  accepts: [PaymentRequirements];
}

/**
 * The authorization details the client commits to when paying.
 * Included inside PaymentPayload.payload; also used server-side
 * to reconstruct the canonical bytes for HMAC verification.
 */
export interface PaymentAuthorization {
  requestId: string;
  op: TaskOp;
  a: number;
  b: number;
  amount: string;
  /** Unix epoch seconds — authorization expires after this */
  validBefore: number;
  /** Random hex nonce for replay prevention */
  nonce: string;
}

/** Client → Server: payment proof header body (base64-encoded JSON) */
export interface PaymentPayload {
  x402Version: 2;
  resource: ResourceInfo;
  accepted: PaymentRequirements;
  payload: {
    /** 0x-prefixed HMAC-SHA256 over canonical PaymentAuthorization bytes */
    signature: string;
    authorization: PaymentAuthorization;
  };
}

/** Server → Client: settlement confirmation in X-PAYMENT-RESPONSE header */
export interface SettlementResponse {
  success: boolean;
  /** Mock transaction hash */
  transaction: string;
  network: string;
  payer?: string;
  errorReason?: string;
}

/** 200 response body */
export interface TaskResponse {
  result: number;
  agentId: string;
}
