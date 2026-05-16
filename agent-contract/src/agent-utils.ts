import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes, concatBytes } from "@noble/hashes/utils";
import type { AgentId, Bytes32 } from "./types.js";

// ─── Hashing ──────────────────────────────────────────────────────────────────

/** SHA-256 of a UTF-8 string or raw bytes → 0x-prefixed hex Bytes32. */
export function sha256hex(input: string | Uint8Array): Bytes32 {
  const bytes = typeof input === "string" ? utf8ToBytes(input) : input;
  return `0x${bytesToHex(sha256(bytes))}`;
}

/**
 * Composite key for Compact Map lookups.
 * SHA-256(part0 ++ part1 ++ ...) where each part is UTF-8 encoded.
 * Used for metadataStore, feedbackValue, and all other multi-field map keys.
 */
export function compositeKey(...parts: (string | bigint | number)[]): Bytes32 {
  const encoded = parts.map((p) => utf8ToBytes(String(p)));
  return `0x${bytesToHex(sha256(concatBytes(...encoded)))}`;
}

/**
 * Map key for IdentityRegistry ledgers (agentUriHash, agentWallet, agentOwner).
 * Matches reputation.compact: agentIdKey = SHA-256(UTF-8 decimal string of agentId).
 */
export function agentIdKey(id: AgentId): Bytes32 {
  return sha256hex(String(id));
}

// ─── Bytes32 encoding / decoding ──────────────────────────────────────────────

/** All-zero Bytes32 — used to represent an unset wallet on-chain. */
export function zeroBytes32(): Bytes32 {
  return `0x${"00".repeat(32)}`;
}

/**
 * Encode an AgentId (bigint) into Bytes32.
 * Big-endian uint64 in bytes 24-31; bytes 0-23 are zero.
 */
export function encodeAgentId(id: AgentId): Bytes32 {
  const buf = new Uint8Array(32);
  let v = id;
  for (let i = 31; i >= 24; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return `0x${bytesToHex(buf)}`;
}

/** Decode a Bytes32 back to AgentId (reads last 8 bytes as big-endian uint64). */
export function decodeAgentId(b: Bytes32): AgentId {
  const hex = b.slice(2);
  return BigInt(`0x${hex.slice(48)}`);
}

/**
 * Encode (value, valueDecimals) into Bytes32.
 * Layout: bytes 0-15 = int128 value big-endian, bytes 16-30 = zero, byte 31 = decimals.
 *
 * Examples from ERC-8004:
 *   quality 87/100  → encodeValue(87, 0)
 *   uptime  99.77%  → encodeValue(9977, 2)
 */
export function encodeValue(value: number, decimals: number): Bytes32 {
  if (decimals < 0 || decimals > 255) throw new RangeError("decimals must be 0-255");
  const buf = new Uint8Array(32);
  // Write value as big-endian int128 into bytes 0-15.
  let v = BigInt(Math.abs(value));
  for (let i = 15; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  // Encode sign in the high bit of byte 0 for negative values.
  if (value < 0) buf[0] |= 0x80;
  buf[31] = decimals;
  return `0x${bytesToHex(buf)}`;
}

/** Decode a Bytes32 encoded by encodeValue back to (value, decimals). */
export function decodeValue(b: Bytes32): { value: number; decimals: number } {
  const hex = b.slice(2);
  const buf = Uint8Array.from(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const negative = (buf[0] & 0x80) !== 0;
  const valueBuf = buf.slice(0, 16);
  if (negative) valueBuf[0] &= 0x7f;
  let v = 0n;
  for (const byte of valueBuf) v = (v << 8n) | BigInt(byte);
  return { value: negative ? -Number(v) : Number(v), decimals: buf[31] };
}

/**
 * Encode a response score (0-100) into Bytes32.
 * Single byte in position 31; all other bytes are zero.
 */
export function encodeResponse(response: number): Bytes32 {
  if (response < 0 || response > 100) throw new RangeError("response must be 0-100");
  const buf = new Uint8Array(32);
  buf[31] = response;
  return `0x${bytesToHex(buf)}`;
}

/** Decode a response Bytes32 back to a number 0-100. */
export function decodeResponse(b: Bytes32): number {
  const hex = b.slice(2);
  return parseInt(hex.slice(62), 16);
}

/**
 * Encode a unix timestamp (seconds) into Bytes32.
 * Big-endian uint64 in bytes 24-31.
 */
export function encodeTimestamp(ts: number): Bytes32 {
  return encodeAgentId(BigInt(ts));
}

/** Current unix timestamp as Bytes32. */
export function nowTimestamp(): Bytes32 {
  return encodeTimestamp(Math.floor(Date.now() / 1000));
}
