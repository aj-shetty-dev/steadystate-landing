// Approximate Ramadan dates (UTC) for 2024-2030 — based on published Umm al-Qura calendar.
// Real production deployments should re-verify these each year against the UAE General Authority of Islamic Affairs sighting.
// Fajr/Iftar windows are Dubai-local approximations.
export interface RamadanRange {
  start: string; // YYYY-MM-DD (first day of Ramadan, Dubai local)
  end: string;   // YYYY-MM-DD inclusive last day
}

export const RAMADAN_RANGES: RamadanRange[] = [
  { start: '2024-03-11', end: '2024-04-09' },
  { start: '2025-03-01', end: '2025-03-29' },
  { start: '2026-02-18', end: '2026-03-19' },
  { start: '2027-02-08', end: '2027-03-09' },
  { start: '2028-01-28', end: '2028-02-25' },
  { start: '2029-01-16', end: '2029-02-14' },
  { start: '2030-01-06', end: '2030-02-04' },
];

// Dubai-local Fajr/Iftar hours rounded to nearest minute, averaged across the month.
// Outside Ramadan months these are unused.
export const DEFAULT_FAJR_HOUR_LOCAL = 5;   // 05:00 local
export const DEFAULT_IFTAR_HOUR_LOCAL = 18; // 18:00 local

// Dubai = UTC+4 year-round (no DST).
export const DUBAI_OFFSET_HOURS = 4;
