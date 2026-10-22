// Calendar months for the monthly report ("2026-09"), resolved in a time zone. Pure, client-safe.

export const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function localParts(ts: number, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ts)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Offset (local minus UTC) of the zone at `ts`, in milliseconds. */
function zoneOffset(ts: number, timeZone: string): number {
  const p = localParts(ts, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** UTC timestamp of local midnight on the first day of `month` (1-12) in the zone. */
function zonedMonthStart(year: number, month: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, 1);
  let ts = guess - zoneOffset(guess, timeZone);
  const corrected = guess - zoneOffset(ts, timeZone);
  if (corrected !== ts) ts = corrected;
  return ts;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(value: unknown): { year: number; month: number } | null {
  const match = typeof value === 'string' ? MONTH_KEY.exec(value.trim()) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

export function shiftMonth(key: string, delta: number): string {
  const parsed = parseMonthKey(key);
  if (!parsed) throw new Error('Mês inválido.');
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}

/** Month that `now` falls in, in the zone. */
export function currentMonthKey(now: Date, timeZone: string): string {
  const p = localParts(now.getTime(), safeZone(timeZone));
  return monthKey(p.year, p.month);
}

/** Default report month: the last complete month. */
export function lastCompleteMonthKey(now: Date, timeZone: string): string {
  return shiftMonth(currentMonthKey(now, timeZone), -1);
}

/** [start, end) of the month in UTC milliseconds, using local midnight in the zone. */
export function monthRange(key: string, timeZone: string): { start: number; end: number } {
  const parsed = parseMonthKey(key);
  if (!parsed) throw new Error('Mês inválido.');
  const zone = safeZone(timeZone);
  const next = parseMonthKey(shiftMonth(key, 1))!;
  return { start: zonedMonthStart(parsed.year, parsed.month, zone), end: zonedMonthStart(next.year, next.month, zone) };
}

/** "setembro de 2026". */
export function monthLabel(key: string): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return `${MONTH_NAMES[parsed.month - 1]} de ${parsed.year}`;
}

/**
 * The requested month when valid and not after the current month; otherwise the last complete one.
 * The current month is allowed (a partial report), the future is not.
 */
export function resolveReportMonth(requested: unknown, now: Date, timeZone: string): string {
  const fallback = lastCompleteMonthKey(now, timeZone);
  const parsed = parseMonthKey(requested);
  if (!parsed) return fallback;
  const key = monthKey(parsed.year, parsed.month);
  return key > currentMonthKey(now, timeZone) ? fallback : key;
}

/** The most recent `count` months, newest first, starting with the current one. */
export function recentMonths(now: Date, timeZone: string, count = 12): string[] {
  const current = currentMonthKey(now, timeZone);
  return Array.from({ length: count }, (_, index) => shiftMonth(current, -index));
}
