import { describe, expect, it } from 'vitest';
import { formatDuration, median, replyMetrics, timeSavedMinutes } from './metrics';

const review = (rating: number, timestamp: string, answer?: string, ownerTimestamp?: string) => ({
  rating: { value: rating }, timestamp, owner_answer: answer, owner_timestamp: ownerTimestamp,
});

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('replyMetrics', () => {
  const reviews = [
    review(5, '2026-10-01 10:00:00 +00:00', 'Obrigado!', '2026-10-01 12:00:00 +00:00'), // 2 h
    review(2, '2026-10-02 10:00:00 +00:00', 'Sentimos muito', '2026-10-03 10:00:00 +00:00'), // 24 h
    review(1, '2026-10-03 10:00:00 +00:00'),
    review(3, '2026-10-04 10:00:00 +00:00', '   '),
    review(4, '2026-10-05 10:00:00 +00:00', 'Valeu'), // no reply date
  ];

  it('computes reply rates, unanswered negatives and the median delay', () => {
    const metrics = replyMetrics(reviews, 4);
    expect(metrics).toMatchObject({
      total: 5, answered: 3, replyRate: 60, negatives: 3, negativesAnswered: 1, unansweredNegatives: 2,
      medianReplyHours: 13, timedReplies: 2, backlogMinutes: 8,
    });
    expect(metrics.negativeReplyRate).toBeCloseTo(33.3, 1);
  });

  it('returns nulls without reviews', () => {
    expect(replyMetrics([])).toMatchObject({ replyRate: null, negativeReplyRate: null, medianReplyHours: null, backlogMinutes: 0 });
  });
});

describe('time estimates', () => {
  it('counts minutes per automatic check', () => {
    expect(timeSavedMinutes(12, 5)).toBe(60);
    expect(timeSavedMinutes(-1)).toBe(0);
  });

  it('formats durations in Portuguese', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(200)).toBe('3 h 20 min');
    expect(formatDuration(60 * 52)).toBe('2 dias e 4 h');
  });
});
