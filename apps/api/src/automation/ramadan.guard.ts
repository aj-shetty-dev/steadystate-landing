import { Injectable } from '@nestjs/common';
import {
  DEFAULT_FAJR_HOUR_LOCAL,
  DEFAULT_IFTAR_HOUR_LOCAL,
  DUBAI_OFFSET_HOURS,
  RAMADAN_RANGES,
} from './ramadan-calendar';

// Ramadan-aware send suppression.
// Suppresses non-essential outbound messages between Fajr and Iftar during Ramadan.
// Uses static Umm al-Qura table + Dubai offset; revisit annually.
@Injectable()
export class RamadanGuard {
  shouldSuppressNow(now: Date = new Date()): boolean {
    const local = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 3_600_000);
    const ymd = local.toISOString().slice(0, 10);
    const inRamadan = RAMADAN_RANGES.some((r) => ymd >= r.start && ymd <= r.end);
    if (!inRamadan) return false;
    const hour = local.getUTCHours();
    return hour >= DEFAULT_FAJR_HOUR_LOCAL && hour < DEFAULT_IFTAR_HOUR_LOCAL;
  }
}
