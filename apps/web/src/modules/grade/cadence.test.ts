import { describe, expect, it } from 'vitest';
import { clampMonthDay, nextCadenceRun, type CadenceSpec } from './cadence';

// Fortaleza is UTC-3 all year, so 03:00 local is 06:00 UTC.
const fortnightly: CadenceSpec = { frequency: 'biweekly', weekday: 1, month_day: null, time_of_day: '03:00', time_zone: 'America/Fortaleza' };
const monthly: CadenceSpec = { frequency: 'monthly', weekday: null, month_day: 5, time_of_day: '03:00', time_zone: 'America/Fortaleza' };
const iso = (timestamp: number) => new Date(timestamp).toISOString();

describe('fortnightly', () => {
  it('starts on the next matching weekday when the schedule is saved', () => {
    // Saturday 17 Oct 2026 -> Monday 19 Oct
    expect(iso(nextCadenceRun(fortnightly, Date.parse('2026-10-17T12:00:00Z')))).toBe('2026-10-19T06:00:00.000Z');
  });

  it('skips a week after a claimed slot', () => {
    const slot = Date.parse('2026-10-19T06:00:00Z');
    expect(iso(nextCadenceRun(fortnightly, slot + 30_000, slot))).toBe('2026-11-02T06:00:00.000Z');
  });

  it('skips fortnights missed during a long outage', () => {
    const slot = Date.parse('2026-10-19T06:00:00Z');
    const now = Date.parse('2026-11-20T00:00:00Z');
    expect(iso(nextCadenceRun(fortnightly, now, slot))).toBe('2026-11-30T06:00:00.000Z');
  });

  it('keeps the local hour across a DST change', () => {
    const london: CadenceSpec = { ...fortnightly, time_zone: 'Europe/London' };
    // 19 Oct is BST (UTC+1), 2 Nov is GMT.
    const slot = Date.parse('2026-10-19T02:00:00Z');
    expect(iso(nextCadenceRun(london, slot + 1000, slot))).toBe('2026-11-02T03:00:00.000Z');
  });
});

describe('monthly', () => {
  it('uses this month when the day is still ahead', () => {
    expect(iso(nextCadenceRun(monthly, Date.parse('2026-10-02T12:00:00Z')))).toBe('2026-10-05T06:00:00.000Z');
  });

  it('rolls over to the next month and the next year', () => {
    expect(iso(nextCadenceRun(monthly, Date.parse('2026-10-05T06:00:01Z')))).toBe('2026-11-05T06:00:00.000Z');
    expect(iso(nextCadenceRun(monthly, Date.parse('2026-12-20T00:00:00Z')))).toBe('2027-01-05T06:00:00.000Z');
  });

  it('limits the day to 1-28', () => {
    expect(clampMonthDay(31)).toBe(28);
    expect(clampMonthDay(0)).toBe(1);
    expect(clampMonthDay(null)).toBe(1);
  });
});
