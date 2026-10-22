import { describe, expect, it } from 'vitest';
import type { GridPoint } from '@/lib/db';
import { compareWithCompetitors, competitorPoints } from './comparison';

const item = (rank: number, title: string, domain: string, target = false) => ({ rank_group: rank, title, domain, is_target: target });

const results: GridPoint[] = [
  { row: 0, col: 0, rank: 2, items: [item(1, 'Rival A', 'a.com'), item(2, 'Cliente', 'c.com', true), item(3, 'Rival B', 'b.com')] },
  { row: 0, col: 1, rank: null, items: [item(1, 'Rival A', 'a.com'), item(2, 'Rival C', 'cc.com')] },
];

describe('competitorPoints', () => {
  it('reads the same scan from a competitor point of view', () => {
    expect(competitorPoints(results, 'a.com').map((point) => point.rank)).toEqual([1, 1]);
    expect(competitorPoints(results, 'b.com').map((point) => point.rank)).toEqual([3, null]);
  });
});

describe('compareWithCompetitors', () => {
  it('puts the client first and the strongest competitors after it', () => {
    const compared = compareWithCompetitors(results, 'Cliente', [
      { key: 'b.com', name: 'Rival B' }, { key: 'cc.com', name: 'Rival C' }, { key: 'a.com', name: 'Rival A' },
    ], 2);
    expect(compared.map((business) => business.name)).toEqual(['Cliente', 'Rival A', 'Rival C']);
    expect(compared[0].isTarget).toBe(true);
    expect(compared[1].metrics.shareOfVoice).toBe(100);
  });
});
