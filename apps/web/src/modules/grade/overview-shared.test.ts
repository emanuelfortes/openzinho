import { describe, expect, it } from 'vitest';
import { computeGradeMetrics } from './metrics';
import { distinctValues, filterOverview, parseOverviewFilters, summarizeKeywords, type CampaignOverviewRow } from './overview-shared';

const grid = (ranks: Array<number | null>) => computeGradeMetrics(ranks.map((rank, index) => ({ row: 0, col: index, rank })));

describe('summarizeKeywords', () => {
  it('averages keywords with data and their change against the previous scan', () => {
    const summary = summarizeKeywords([
      { current: grid([1, 1]), previous: grid([3, 3]) }, // 1, was 3
      { current: grid([5, 5]), previous: null }, // 5, no comparison
      { current: null, previous: null },
    ]);
    expect(summary.avgPosition).toBe(3);
    expect(summary.avgPositionDelta).toBe(-2);
    expect(summary.shareOfVoice).toBe(55);
  });

  it('has no numbers without scans', () => {
    expect(summarizeKeywords([{ current: null, previous: null }])).toEqual({ avgPosition: null, shareOfVoice: null, avgPositionDelta: null, shareOfVoiceDelta: null });
  });
});

const row = (over: Partial<CampaignOverviewRow>): CampaignOverviewRow => ({
  projectId: 'p', projectName: 'Cliente', campaignId: 'c', campaignName: 'Campanha', target: 'x', tags: [], owner: '',
  active: true, center: null, keywordCount: 1, avgPosition: null, shareOfVoice: null, avgPositionDelta: null, shareOfVoiceDelta: null, lastRunTs: null,
  ...over,
});

const rows = [
  row({ campaignId: 'a', projectName: 'Clínica Sorriso', tags: ['Aldeota', 'odonto'], owner: 'Ana', avgPosition: 4, shareOfVoice: 40, avgPositionDelta: -1 }),
  row({ campaignId: 'b', projectName: 'Padaria Pão', tags: ['Meireles'], owner: 'Bruno', avgPosition: 12, shareOfVoice: 5, avgPositionDelta: 3 }),
  row({ campaignId: 'c', projectName: 'Academia Forte', tags: ['aldeota'], owner: 'ana', avgPosition: null }),
];
const ids = (filters: Partial<ReturnType<typeof parseOverviewFilters>>) =>
  filterOverview(rows, { tag: '', owner: '', q: '', sort: 'nome', ...filters }).map((item) => item.campaignId);

describe('filterOverview', () => {
  it('filters by tag and owner ignoring case and accents', () => {
    expect(ids({ tag: 'ALDEOTA' })).toEqual(['c', 'a']);
    expect(ids({ owner: 'Ana' })).toEqual(['c', 'a']);
    expect(ids({ q: 'clinica' })).toEqual(['a']);
  });

  it('sorts by position, share of voice and biggest drop, rows without data last', () => {
    expect(ids({ sort: 'posicao' })).toEqual(['a', 'b', 'c']);
    expect(ids({ sort: 'sov' })).toEqual(['a', 'b', 'c']);
    expect(ids({ sort: 'variacao' })).toEqual(['b', 'a', 'c']);
  });
});

describe('helpers', () => {
  it('lists distinct tags once', () => {
    expect(distinctValues(rows, (item) => item.tags)).toEqual(['Aldeota', 'Meireles', 'odonto']);
  });

  it('falls back to sorting by name', () => {
    expect(parseOverviewFilters({ ordem: 'qualquer' }).sort).toBe('nome');
  });
});
