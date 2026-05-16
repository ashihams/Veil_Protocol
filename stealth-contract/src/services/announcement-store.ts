import type { StealthAnnouncement } from "../types.js";

/**
 * Shielded announcement log — maps to private ledger region + witness export (MVP: in-memory).
 */
export class AnnouncementStore {
  private readonly announcements: StealthAnnouncement[] = [];

  /** In real Compact: append inside circuit; only hash survives on public ledger. */
  appendShielded(a: StealthAnnouncement): void {
    this.announcements.push(a);
  }

  /** Witness `scan_announcements` — returns ciphertext for local scanning (no chain IO). */
  getAll(): StealthAnnouncement[] {
    return [...this.announcements];
  }

  clear(): void {
    this.announcements.length = 0;
  }
}
