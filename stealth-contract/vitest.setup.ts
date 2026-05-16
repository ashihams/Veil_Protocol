import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";

/** noble-secp256k1 v2 signing + utilities that use HMAC internally */
secp.etc.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => {
  const h = hmac.create(sha256, key);
  for (const m of messages) h.update(m);
  return h.digest();
};
