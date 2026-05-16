import { AnnouncementStore } from "./announcement-store.js";
import { PaymentVerifier } from "./payment-verifier.js";
import { StealthKeyRegistry } from "./stealth-key-registry.js";

/** Singleton registry — wire API/frontend to this until Compact deployment replaces storage. */
export const registry = new StealthKeyRegistry();

/** Singleton announcement log — shielded on chain; in-memory for demos. */
export const announcements = new AnnouncementStore();

/** Singleton payment verifier — replay set is per-process (reset on deploy). */
export const verifier = new PaymentVerifier();
