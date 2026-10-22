import { describe, expect, it } from 'vitest';
import { classifyFetched, estimateMonthlyUsd, estimateRefreshUsd, isRefreshDue, nextDepth, normalizeReview } from './monitor';
import { buildAlertEmail } from './alerts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 9, 22, 10);

describe('isRefreshDue', () => {
  const base = { frequency: 'diaria' as const, lastPostedAt: null, pendingTaskId: null, active: true };

  it('is due on the first run and after the interval, with slack for the daily job', () => {
    expect(isRefreshDue(base, now)).toBe(true);
    expect(isRefreshDue({ ...base, lastPostedAt: now - DAY + HOUR }, now)).toBe(true);
    expect(isRefreshDue({ ...base, lastPostedAt: now - 12 * HOUR }, now)).toBe(false);
    expect(isRefreshDue({ ...base, frequency: 'semanal', lastPostedAt: now - 3 * DAY }, now)).toBe(false);
    expect(isRefreshDue({ ...base, frequency: 'semanal', lastPostedAt: now - 7 * DAY + HOUR }, now)).toBe(true);
  });

  it('never posts while a task is pending or the profile is paused', () => {
    expect(isRefreshDue({ ...base, pendingTaskId: 'abc' }, now)).toBe(false);
    expect(isRefreshDue({ ...base, active: false }, now)).toBe(false);
  });
});

describe('nextDepth', () => {
  it('doubles when every fetched review was new and steps down when few were', () => {
    expect(nextDepth(10, 10, 10, 'diaria')).toBe(20);
    expect(nextDepth(80, 80, 80, 'semanal')).toBe(100);
    expect(nextDepth(40, 40, 2, 'semanal')).toBe(20);
    expect(nextDepth(20, 20, 8, 'semanal')).toBe(20);
  });
});

describe('cost estimates', () => {
  it('bills per page of 10 reviews', () => {
    expect(estimateRefreshUsd(10)).toBeCloseTo(0.00075);
    expect(estimateRefreshUsd(25)).toBeCloseTo(0.00225);
    expect(estimateMonthlyUsd('diaria', 10)).toBeCloseTo(30 * 0.00075);
    expect(estimateMonthlyUsd('semanal', 20)).toBeCloseTo(5 * 0.0015);
  });
});

describe('classifyFetched', () => {
  const items = [
    { review_id: 'a', rating: { value: 2 }, profile_name: 'Ana', timestamp: '2026-10-20 10:00:00 +00:00', review_text: 'Demorou<br>muito' },
    { review_id: 'b', rating: { value: 5 }, profile_name: 'Bruno', timestamp: '2026-10-20 11:00:00 +00:00' },
    { review_id: 'a', rating: { value: 2 }, profile_name: 'Ana' },
    { rating: { value: 3 }, profile_name: 'Sem ID', timestamp: '2026-10-21 09:00:00 +00:00', review_text: 'ok' },
  ];

  it('marks the first fetch as baseline, never as alerts', () => {
    const fresh = classifyFetched(items, new Set(), true);
    expect(fresh).toHaveLength(3);
    expect(fresh.every((review) => review.alert === 'base')).toBe(true);
  });

  it('alerts only new reviews with up to 3 stars', () => {
    const known = new Set(['b']);
    const fresh = classifyFetched(items, known, false);
    expect(fresh.map((review) => [review.key.startsWith('h:') ? 'hash' : review.key, review.alert])).toEqual([['a', 'pendente'], ['hash', 'pendente']]);
    expect(fresh[0].text).toBe('Demorou muito');
  });

  it('gives reviews without an ID a stable key', () => {
    expect(normalizeReview(items[3]).key).toBe(normalizeReview({ ...items[3] }).key);
    const all = new Set(classifyFetched(items, new Set(), true).map((review) => review.key));
    expect(classifyFetched(items, all, false)).toEqual([]);
  });
});

describe('buildAlertEmail', () => {
  it('lists author, rating, excerpt and link, escaping HTML', () => {
    const email = buildAlertEmail([{
      projectName: 'Clínica', listingTitle: 'Clínica Sorriso', listingUrl: 'https://maps.google.com/?cid=1', rating: 2,
      author: 'Ana <b>', publishedAt: Date.UTC(2026, 9, 20, 12), text: 'Atendimento ruim', url: 'https://www.google.com/maps/reviews/x',
    }], { dashboardUrl: 'https://nexo.exemplo.com/dashboard/monitor-de-avaliacoes' });
    expect(email.subject).toBe('Nova avaliação de até 3 estrelas: Clínica Sorriso');
    expect(email.text).toContain('★★☆☆☆ (2)');
    expect(email.text).toContain('20/10/2026');
    expect(email.text).toContain('https://www.google.com/maps/reviews/x');
    expect(email.html).toContain('Ana &lt;b&gt;');
    expect(email.html).not.toContain('<b>');
  });
});
