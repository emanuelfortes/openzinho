// Cross-client campaign overview: aggregation, filters and sorting. Pure, safe for any component.
import type { GradeMetrics } from './metrics';

export interface CampaignOverviewRow {
  projectId: string;
  projectName: string;
  campaignId: string;
  campaignName: string;
  target: string;
  tags: string[];
  owner: string;
  active: boolean;
  center: { lat: number; lng: number } | null;
  keywordCount: number;
  /** Mean across keywords with a finished scan. */
  avgPosition: number | null;
  shareOfVoice: number | null;
  /** Change against each keyword's previous scan; negative avgPosition = moved up. */
  avgPositionDelta: number | null;
  shareOfVoiceDelta: number | null;
  lastRunTs: number | null;
}

export type OverviewSort = 'nome' | 'posicao' | 'sov' | 'variacao';

export interface OverviewFilters {
  tag: string;
  owner: string;
  q: string;
  sort: OverviewSort;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: number[]) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null);

export function summarizeKeywords(keywords: Array<{ current: GradeMetrics | null; previous: GradeMetrics | null }>) {
  const withData = keywords.filter((keyword) => keyword.current && keyword.current.avgPosition !== null);
  const compared = withData.filter((keyword) => keyword.previous && keyword.previous.avgPosition !== null);
  return {
    avgPosition: mean(withData.map((keyword) => keyword.current!.avgPosition!)),
    shareOfVoice: mean(withData.map((keyword) => keyword.current!.shareOfVoice)),
    avgPositionDelta: mean(compared.map((keyword) => keyword.current!.avgPosition! - keyword.previous!.avgPosition!)),
    shareOfVoiceDelta: mean(compared.map((keyword) => keyword.current!.shareOfVoice - keyword.previous!.shareOfVoice)),
  };
}

export function parseOverviewFilters(params: Record<string, string | string[] | undefined>): OverviewFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value ?? '').trim();
  };
  const sort = one('ordem') as OverviewSort;
  return {
    tag: one('etiqueta').slice(0, 40),
    owner: one('responsavel').slice(0, 80),
    q: one('q').slice(0, 80),
    sort: (['nome', 'posicao', 'sov', 'variacao'] as const).includes(sort) ? sort : 'nome',
  };
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Rows without data go last whatever the order. */
export function filterOverview(rows: CampaignOverviewRow[], filters: OverviewFilters): CampaignOverviewRow[] {
  const query = fold(filters.q);
  const filtered = rows.filter((row) => {
    if (filters.tag && !row.tags.some((tag) => fold(tag) === fold(filters.tag))) return false;
    if (filters.owner && fold(row.owner) !== fold(filters.owner)) return false;
    if (query && !fold(`${row.projectName} ${row.campaignName} ${row.target}`).includes(query)) return false;
    return true;
  });
  const last = (value: number | null, fallback: number) => (value === null ? fallback : value);
  const by: Record<OverviewSort, (a: CampaignOverviewRow, b: CampaignOverviewRow) => number> = {
    nome: (a, b) => a.projectName.localeCompare(b.projectName, 'pt-BR') || a.campaignName.localeCompare(b.campaignName, 'pt-BR'),
    posicao: (a, b) => last(a.avgPosition, Infinity) - last(b.avgPosition, Infinity),
    sov: (a, b) => last(b.shareOfVoice, -Infinity) - last(a.shareOfVoice, -Infinity),
    // Biggest drop first: a positive position delta means the client lost ground.
    variacao: (a, b) => last(b.avgPositionDelta, -Infinity) - last(a.avgPositionDelta, -Infinity),
  };
  return [...filtered].sort(by[filters.sort]);
}

export function distinctValues(rows: CampaignOverviewRow[], pick: (row: CampaignOverviewRow) => string[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) for (const value of pick(row)) if (value && !seen.has(fold(value))) seen.set(fold(value), value);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
