import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";

/** Provide HMAC-SHA256 sync for any noble-secp256k1 usage in tests */
// @ts-expect-error — optional global for noble crypto interop
globalThis.__nobleHmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => {
  const h = hmac.create(sha256, key);
  for (const m of messages) h.update(m);
  return h.digest();
};
