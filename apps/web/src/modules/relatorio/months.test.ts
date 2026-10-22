import { describe, expect, it } from 'vitest';
import { lastCompleteMonthKey, monthLabel, monthRange, recentMonths, resolveReportMonth, shiftMonth } from './months';

describe('months', () => {
  it('shifts across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-03', -14)).toBe('2025-01');
  });

  it('uses the local calendar for the last complete month', () => {
    // 2026-10-01 01:00 UTC is still 30 September in São Paulo (UTC-3).
    const now = new Date(Date.UTC(2026, 9, 1, 1, 0));
    expect(lastCompleteMonthKey(now, 'America/Sao_Paulo')).toBe('2026-08');
    expect(lastCompleteMonthKey(now, 'UTC')).toBe('2026-09');
  });

  it('returns local midnight boundaries', () => {
    const range = monthRange('2026-09', 'America/Sao_Paulo');
    expect(new Date(range.start).toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(new Date(range.end).toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(new Date(monthRange('2026-02', 'UTC').end).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('handles daylight saving changes inside the month', () => {
    const range = monthRange('2026-03', 'Europe/Lisbon');
    expect(new Date(range.start).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(new Date(range.end).toISOString()).toBe('2026-03-31T23:00:00.000Z');
  });

  it('rejects malformed or future months', () => {
    const now = new Date(Date.UTC(2026, 9, 22, 12));
    expect(resolveReportMonth('2026-07', now, 'UTC')).toBe('2026-07');
    expect(resolveReportMonth('2026-10', now, 'UTC')).toBe('2026-10');
    expect(resolveReportMonth('2026-11', now, 'UTC')).toBe('2026-09');
    expect(resolveReportMonth('2026-13', now, 'UTC')).toBe('2026-09');
    expect(resolveReportMonth(['2026-07'], now, 'UTC')).toBe('2026-09');
    expect(resolveReportMonth(undefined, now, 'Zona/Inexistente')).toBe('2026-09');
  });

  it('labels and lists months in Portuguese', () => {
    expect(monthLabel('2026-03')).toBe('março de 2026');
    expect(recentMonths(new Date(Date.UTC(2026, 0, 15)), 'UTC', 3)).toEqual(['2026-01', '2025-12', '2025-11']);
  });
});
