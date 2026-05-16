export * as Stealth from "./managed/stealth/contract/index.js";
export * from "./witnesses.js";
export * from "./types.js";
export * from "./stealth.js";

export {
  registry,
  announcements,
  verifier,
} from "./services/index.js";
export { StealthKeyRegistry } from "./services/stealth-key-registry.js";
export { AnnouncementStore } from "./services/announcement-store.js";
export {
  PaymentVerifier,
  type VerifyAndMarkResult,
} from "./services/payment-verifier.js";

/** Compact- / Midnight-aligned crypto (DKSAP); distinct from legacy `types.ts` field names. */
export type {
  PaymentProof,
  PaymentProof as CompactPaymentProof,
  ScannedPayment as CompactScannedPayment,
  StealthAnnouncement as CompactStealthAnnouncement,
  StealthPublicKeys as CompactStealthPublicKeys,
} from "./crypto/types.js";
export {
  generateStealthKeys as generateCompactStealthKeys,
  deriveStealthAddress as deriveCompactStealthAddress,
  scanAnnouncements as scanCompactAnnouncements,
  checkAnnouncement as checkCompactAnnouncement,
  buildPaymentProof,
  verifyPaymentAttestation,
  stealthAddressFromPublicPoint,
} from "./crypto/stealth.js";
