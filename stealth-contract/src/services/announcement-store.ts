import type { StealthAnnouncement } from "../crypto/types.js";

function parseViewTag(viewTag: string): number {
  const s = viewTag.trim();
  if (s.length === 0) throw new Error("AnnouncementStore: empty viewTag");
  if (/^(0x|0X)/.test(s)) {
    const n = Number.parseInt(s.slice(2), 16);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error("AnnouncementStore: viewTag must be a single byte");
    }
    return n;
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error("AnnouncementStore: viewTag out of byte range");
    }
    return n;
  }
  if (/^[0-9a-fA-F]{1,2}$/.test(s)) {
    return Number.parseInt(s, 16);
  }
  throw new Error("AnnouncementStore: invalid viewTag string");
}

/**
 * In-memory `AnnouncementLog.compact` — shielded announcement rows (demo: cleartext).
 * On Midnight this is private state; the method shapes stay the same.
 */
export class AnnouncementStore {
  private readonly announcements: StealthAnnouncement[] = [];

  add(announcement: StealthAnnouncement): void {
    this.announcements.push(announcement);
  }

  getAll(): StealthAnnouncement[] {
    return [...this.announcements];
  }

  getByViewTag(viewTag: string): StealthAnnouncement[] {
    const tag = parseViewTag(viewTag);
    return this.announcements.filter((a) => a.viewTag === tag);
  }

  /** Inclusive: all announcements with `timestamp >= since`. */
  getSince(since: number): StealthAnnouncement[] {
    return this.announcements.filter((a) => a.timestamp >= since);
  }
}
