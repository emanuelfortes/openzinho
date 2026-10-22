import { describe, expect, it } from 'vitest';
import type { GridLocalItem, GridPoint } from '@/lib/db';
import {
  analyzeKeyword, edgesReachingTop10, pointMovement, reportSummaryLines, ringOf, sectorOf, sectorStats, summarizeCampaign, topCompetitors,
  type CampaignReport,
} from './analysis';

/** 3x3 grid from a matrix of ranks (row 0 = north). */
function grid(ranks: Array<Array<number | null>>, items?: (row: number, col: number) => GridLocalItem[]): GridPoint[] {
  return ranks.flatMap((line, row) => line.map((rank, col) => ({ row, col, rank, items: items?.(row, col) })));
}

const labels = { monthLabel: 'setembro de 2026', previousMonthLabel: 'agosto de 2026' };
const rival = (rank: number, title = 'Clínica Rival'): GridLocalItem => ({ rank_group: rank, title, domain: 'rival.example', is_target: false });

describe('geometry', () => {
  it('maps cells to compass sectors with north up', () => {
    expect(sectorOf({ row: 1, col: 1 }, 3)).toBeNull();
    expect(sectorOf({ row: 0, col: 1 }, 3)).toBe('N');
    expect(sectorOf({ row: 0, col: 2 }, 3)).toBe('NE');
    expect(sectorOf({ row: 1, col: 2 }, 3)).toBe('E');
    expect(sectorOf({ row: 2, col: 2 }, 3)).toBe('SE');
    expect(sectorOf({ row: 2, col: 1 }, 3)).toBe('S');
    expect(sectorOf({ row: 2, col: 0 }, 3)).toBe('SO');
    expect(sectorOf({ row: 1, col: 0 }, 3)).toBe('O');
    expect(sectorOf({ row: 0, col: 0 }, 3)).toBe('NO');
    expect(ringOf({ row: 0, col: 3 }, 5)).toBe(2);
  });

  it('averages each sector with 21 for missing ranks and compares with the previous scan', () => {
    const current = grid([[1, 2, 3], [null, 1, 5], [20, null, 8]]);
    const previous = grid([[5, 2, 3], [4, 1, 5], [20, 4, 8]]);
    const stats = sectorStats(current, previous, 3);
    expect(stats.find((stat) => stat.sector === 'O')).toMatchObject({ points: 1, avgPosition: 21, previousAvgPosition: 4, top10Pct: 0 });
    expect(stats.find((stat) => stat.sector === 'NO')).toMatchObject({ avgPosition: 1, previousAvgPosition: 5, top3Pct: 100 });
    expect(stats).toHaveLength(8);
  });

  it('flags edges where most boundary points are in the top 10', () => {
    const points = grid([[2, 3, 9], [15, 1, 4], [null, null, 18]]);
    expect(edgesReachingTop10(points, 3)).toEqual(['N', 'E']);
  });
});

describe('pointMovement', () => {
  it('counts points that improved, worsened and crossed the top 3', () => {
    const movement = pointMovement(grid([[1, 5, null], [2, 2, 2], [2, 2, 2]]), grid([[4, 2, 7], [2, 2, 2], [2, 2, 2]]));
    expect(movement).toMatchObject({ comparable: 9, improved: 1, worsened: 2, unchanged: 6, enteredTop3: 1, leftTop3: 1, leftTop10: 1 });
  });
});

describe('topCompetitors', () => {
  it('ranks rivals by top-3 points and counts a business once per point', () => {
    const current = grid([[1, 1, 1], [1, 1, 1], [1, 1, 1]], (row) => [rival(row === 2 ? 5 : 2), rival(9), { ...rival(3, 'Outra'), domain: 'outra.example' }]);
    const previous = grid([[1, 1, 1], [1, 1, 1], [1, 1, 1]], () => [rival(8)]);
    const [first, second] = topCompetitors(current, previous);
    expect(first).toMatchObject({ name: 'Outra', top3Points: 9, previousTop3Points: 0 });
    expect(second).toMatchObject({ name: 'Clínica Rival', top3Points: 6, presentPoints: 9, previousTop3Points: 0 });
  });
});

describe('analyzeKeyword', () => {
  it('states missing scans instead of inventing numbers', () => {
    const report = analyzeKeyword({ keyword: 'dentista', gridSize: 3, spacingKm: 1, inactive: new Set(), current: null, previous: null, ...labels });
    expect(report.current).toBeNull();
    expect(report.facts).toEqual([]);
    expect(report.hypotheses).toEqual([]);
    expect(report.missing.join(' ')).toContain('Nenhuma varredura concluída em setembro de 2026');
    expect(report.missing.join(' ')).toContain('agosto de 2026');
  });

  it('reports the previous month only as the last available measurement', () => {
    const report = analyzeKeyword({
      keyword: 'dentista', gridSize: 3, spacingKm: 1, inactive: new Set(), current: null,
      previous: { ts: 1, results: grid([[1, 1, 1], [1, 1, 1], [1, 1, 1]]) }, ...labels,
    });
    expect(report.facts[0]).toContain('Última medição disponível (agosto de 2026)');
    expect(report.delta).toBeNull();
  });

  it('compares months, excludes inactive points and labels hypotheses separately from facts', () => {
    const current = grid([[1, 1, 1], [null, 1, 1], [null, null, null]], (row, col) => (row === 2 || col === 0 ? [rival(1)] : [rival(4)]));
    const previous = grid([[1, 1, 1], [1, 1, 1], [1, 1, 1]], () => [rival(4)]);
    const report = analyzeKeyword({
      keyword: 'dentista', gridSize: 3, spacingKm: 1, inactive: new Set(['2:2']),
      current: { ts: 2, results: current }, previous: { ts: 1, results: previous }, ...labels,
    });
    expect(report.current).toMatchObject({ activePoints: 8, top3Points: 5, notFoundPoints: 3 });
    expect(report.current!.points.some((point) => point.row === 2 && point.col === 2)).toBe(false);
    expect(report.current!.avgPosition).toBe(8.5);
    expect(report.delta).toMatchObject({ avgPosition: 7.5, shareOfVoice: -37.5, top3Pct: -37.5 });
    expect(report.movement).toMatchObject({ comparable: 8, worsened: 3, leftTop3: 3, unchanged: 5 });
    expect(report.facts.some((fact) => fact.includes('Setores fracos') && fact.includes('SO'))).toBe(true);
    expect(report.facts.some((fact) => fact.includes('Clínica Rival') && fact.includes('4 de 8'))).toBe(true);
    expect(report.hypotheses.some((text) => text.includes('Clínica Rival'))).toBe(true);
    expect(report.hypotheses.some((text) => text.includes('queda'))).toBe(true);
    expect(report.recommendations.some((text) => text.includes('Revisar o histórico'))).toBe(true);
    // Facts never carry the hypothesis wording.
    expect(report.facts.every((fact) => !/pode|parece/.test(fact))).toBe(true);
  });

  it('recommends keeping the cadence when there is no previous month', () => {
    const report = analyzeKeyword({
      keyword: 'dentista', gridSize: 3, spacingKm: 1, inactive: new Set(),
      current: { ts: 2, results: grid([[2, 2, 2], [2, 1, 2], [2, 2, 2]]) }, previous: null, ...labels,
    });
    expect(report.delta).toBeNull();
    expect(report.missing[0]).toContain('agosto de 2026');
    expect(report.recommendations.some((text) => text.includes('cadência'))).toBe(true);
    expect(report.recommendations.some((text) => text.includes('borda'))).toBe(true);
  });
});

describe('campaign summary', () => {
  it('averages keywords and lists movers, then writes the e-mail lines', () => {
    const scan = (rank: number) => ({ ts: 1, results: grid([[rank, rank, rank], [rank, rank, rank], [rank, rank, rank]]) });
    const keywords = [
      analyzeKeyword({ keyword: 'dentista', gridSize: 3, spacingKm: 1, inactive: new Set(), current: scan(2), previous: scan(6), ...labels }),
      analyzeKeyword({ keyword: 'implante', gridSize: 3, spacingKm: 1, inactive: new Set(), current: scan(8), previous: scan(4), ...labels }),
      analyzeKeyword({ keyword: 'clareamento', gridSize: 3, spacingKm: 1, inactive: new Set(), current: null, previous: scan(4), ...labels }),
    ];
    const summary = summarizeCampaign(keywords);
    expect(summary).toMatchObject({ keywordCount: 3, withCurrent: 2, compared: 2, avgPosition: 5, avgPositionDelta: 0, improved: ['dentista'], worsened: ['implante'] });
    const report: CampaignReport = {
      campaignName: 'Odonto', target: 'Clínica Sorriso', gridSize: 3, spacingKm: 1, month: '2026-09', previousMonth: '2026-08',
      ...labels, generatedAt: 0, keywords, summary,
    };
    const lines = reportSummaryLines(report);
    expect(lines[0]).toBe('Odonto (Clínica Sorriso) - setembro de 2026');
    expect(lines).toContain('- clareamento: sem varredura em setembro de 2026.');
    expect(lines.some((line) => line.startsWith('- dentista: posição média 2 (-4)'))).toBe(true);
  });
});
