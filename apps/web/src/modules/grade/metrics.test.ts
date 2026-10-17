import { describe, expect, it } from 'vitest';
import type { GridPoint } from '@/lib/db';
import { compareGradeMetrics, computeGradeMetrics, rankBand, sovWeight } from './metrics';

const grid = (ranks: Array<number | null>): GridPoint[] =>
  ranks.map((rank, index) => ({ row: Math.floor(index / 3), col: index % 3, rank }));

describe('computeGradeMetrics', () => {
  it('counts 21 for points outside the top 20 in the average position', () => {
    // 1 + 21 + 21 + 21 = 64 / 4 = 16
    const metrics = computeGradeMetrics(grid([1, null, 25, 21]));
    expect(metrics.avgPosition).toBe(16);
  });

  it('splits points into the four bands', () => {
    const metrics = computeGradeMetrics(grid([1, 3, 4, 10, 11, 20, 21, null]));
    expect(metrics.bandCounts).toEqual({ top3: 2, top10: 2, top20: 2, out: 2 });
    expect(metrics.bands).toEqual({ top3: 25, top10: 25, top20: 25, out: 25 });
  });

  it('weights Share of Voice towards the first positions', () => {
    expect(computeGradeMetrics(grid([1, 1])).shareOfVoice).toBe(100);
    // (1 + 0.6 + 0.4 + 0.1 + 0.02 + 0) / 6 = 35.33%
    expect(computeGradeMetrics(grid([1, 2, 3, 7, 15, null])).shareOfVoice).toBe(35.3);
  });

  it('ignores inactive points', () => {
    const metrics = computeGradeMetrics(grid([1, null, null]), new Set(['0:1', '0:2']));
    expect(metrics.activePoints).toBe(1);
    expect(metrics.avgPosition).toBe(1);
    expect(metrics.shareOfVoice).toBe(100);
  });

  it('returns empty metrics for an empty grid', () => {
    const metrics = computeGradeMetrics([]);
    expect(metrics.avgPosition).toBeNull();
    expect(metrics.shareOfVoice).toBe(0);
  });
});

describe('compareGradeMetrics', () => {
  it('reports the change against the previous scan', () => {
    const previous = computeGradeMetrics(grid([5, null]));
    const current = computeGradeMetrics(grid([1, 5]));
    const delta = compareGradeMetrics(current, previous)!;
    expect(delta.avgPosition).toBe(-10);
    expect(delta.shareOfVoice).toBe(50);
    expect(delta.bands.out).toBe(-50);
  });

  it('has no change without a previous scan', () => {
    expect(compareGradeMetrics(computeGradeMetrics(grid([1])), null)).toBeNull();
  });
});

describe('helpers', () => {
  it('treats depth beyond 20 as outside the top 20', () => {
    expect(rankBand(35)).toBe('out');
    expect(sovWeight(35)).toBe(0);
  });
});
