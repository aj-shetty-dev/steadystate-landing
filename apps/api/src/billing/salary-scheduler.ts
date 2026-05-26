// Pure salary-window math. Asia/Dubai is UTC+4, no DST — so we model the
// window in tenant-local wall time and convert to UTC by subtracting the offset.
//
// Inputs:
//   - now: reference instant (UTC)
//   - window: { startDay, endDay, timezone, jitterMinutes }
//
// Outputs:
//   - from / to: UTC Date bounds of the next (or current) salary window
//   - midpointUtc: a deterministic-yet-jittered instant within the window for retry scheduling

export interface SalaryWindowConfig {
  startDay: number;
  endDay: number;
  timezone: string;
  jitterMinutes: number;
}

export interface SalaryWindowSpan {
  from: Date;
  to: Date;
}

const SUPPORTED_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4,
  'Asia/Muscat': 4,
  'Asia/Riyadh': 3,
  'Asia/Qatar': 3,
  'Asia/Bahrain': 3,
  'Asia/Kuwait': 3,
  UTC: 0,
};

export function timezoneOffsetHours(timezone: string): number {
  const offset = SUPPORTED_OFFSETS[timezone];
  if (offset === undefined) {
    throw new Error(`Unsupported timezone for salary window: ${timezone}`);
  }
  return offset;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function localDateToUtc(year: number, monthIndex: number, day: number, hour: number, minute: number, offsetHours: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour - offsetHours, minute));
}

export function windowForMonth(year: number, monthIndex: number, window: SalaryWindowConfig): SalaryWindowSpan {
  const offset = timezoneOffsetHours(window.timezone);
  const max = daysInMonth(year, monthIndex);
  const start = Math.min(window.startDay, max);
  const end = Math.min(window.endDay, max);
  const from = localDateToUtc(year, monthIndex, start, 0, 0, offset);
  const to = localDateToUtc(year, monthIndex, end, 23, 59, offset);
  return { from, to };
}

export function nextSalaryWindow(now: Date, window: SalaryWindowConfig): SalaryWindowSpan {
  const offset = timezoneOffsetHours(window.timezone);
  const local = new Date(now.getTime() + offset * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const monthIndex = local.getUTCMonth();
  const current = windowForMonth(year, monthIndex, window);
  if (now.getTime() <= current.to.getTime()) {
    return current;
  }
  const nextMonth = monthIndex === 11 ? { y: year + 1, m: 0 } : { y: year, m: monthIndex + 1 };
  return windowForMonth(nextMonth.y, nextMonth.m, window);
}

// Deterministic jitter from invoiceId so retries spread across the window
// but the same invoice always lands on the same instant.
export function scheduledInstantFor(invoiceId: string, span: SalaryWindowSpan, window: SalaryWindowConfig): Date {
  const totalMs = span.to.getTime() - span.from.getTime();
  if (totalMs <= 0) return span.from;
  const seed = hashString(invoiceId);
  const jitterMs = Math.min(window.jitterMinutes * 60 * 1000, totalMs);
  const offset = jitterMs === 0 ? 0 : seed % jitterMs;
  return new Date(span.from.getTime() + offset);
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}
