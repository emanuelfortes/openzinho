// Fortnightly and monthly schedule slots for Geo-grid monitors. Daily and weekly slots stay in
// lib/db.ts (upstream); this module only adds the longer cadences agencies sell.

const DAY_MS = 86_400_000;
/** A slot this close to `after` counts as already passed, as in db.ts. */
const SLOT_MARGIN_MS = 5_000;

export interface CadenceSpec {
  frequency: 'biweekly' | 'monthly';
  /** 0 = Sunday. Used by biweekly. */
  weekday: number | null;
  /** 1-28. Used by monthly; days 29-31 do not exist in every month. */
  month_day: number | null;
  /** HH:MM, already validated. */
  time_of_day: string;
  /** IANA zone, already validated. */
  time_zone: string;
}

function zonedParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

function timeZoneOffset(timestamp: number, timeZone: string): number {
  const parts = zonedParts(timestamp, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - timestamp;
}

/** Local wall-clock time to a timestamp; day and month may overflow (Date.UTC normalises them). */
function localTime(year: number, month: number, day: number, timeOfDay: string, timeZone: string): number {
  const [hour, minute] = timeOfDay.split(':').map(Number);
  const localUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = localUtc - timeZoneOffset(localUtc, timeZone);
  // Re-evaluate once so a DST change on the target date is applied.
  return localUtc - timeZoneOffset(first, timeZone);
}

export function clampMonthDay(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), 28);
}

function nextWeekdaySlot(spec: CadenceSpec, from: number): number {
  const local = zonedParts(from, spec.time_zone);
  const weekday = spec.weekday ?? 1;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    if (day.getUTCDay() !== weekday) continue;
    const candidate = localTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), spec.time_of_day, spec.time_zone);
    if (candidate > from + SLOT_MARGIN_MS) return candidate;
  }
  return from + 7 * DAY_MS;
}

/**
 * Next slot strictly after `after`. `previousSlot` is the slot just claimed by the scheduler:
 * a fortnightly monitor then skips the following week instead of running on the next weekday.
 */
export function nextCadenceRun(spec: CadenceSpec, after: number, previousSlot?: number): number {
  if (spec.frequency === 'monthly') {
    const day = clampMonthDay(spec.month_day);
    const local = zonedParts(after, spec.time_zone);
    for (let offset = 0; offset <= 2; offset += 1) {
      const candidate = localTime(local.year, local.month + offset, day, spec.time_of_day, spec.time_zone);
      if (candidate > after + SLOT_MARGIN_MS) return candidate;
    }
    return after + 28 * DAY_MS;
  }

  if (previousSlot === undefined) return nextWeekdaySlot(spec, after);
  let candidate = nextWeekdaySlot(spec, previousSlot + 13 * DAY_MS);
  // After a long worker outage, skip the missed fortnights rather than running them all at once.
  while (candidate <= after + SLOT_MARGIN_MS) candidate = nextWeekdaySlot(spec, candidate + 13 * DAY_MS);
  return candidate;
}

/** Average scheduled runs per month, for cost estimates. */
export function runsPerMonth(frequency: string): number {
  switch (frequency) {
    case 'daily': return 30;
    case 'weekly': return 52 / 12;
    case 'biweekly': return 26 / 12;
    case 'monthly': return 1;
    default: return 0;
  }
}
