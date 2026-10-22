// Monthly campaign report: compares each keyword's last finished scan of a month with the last one
// of the previous month and derives measured facts, labelled hypotheses and labelled recommendations.
// Pure (no database), so the dashboard, the public link, the PDF and the e-mail all read the same numbers.
import type { GridPoint } from '@/lib/db';
import { competitorKey } from '@/app/dashboard/local-finder/grid-insights';
import { computeGradeMetrics, NOT_FOUND_RANK, pointKey, rankBand } from '@/modules/grade/metrics';

export type Sector = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SO' | 'O' | 'NO';
export const SECTORS: Sector[] = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const SECTOR_NAMES: Record<Sector, string> = {
  N: 'norte', NE: 'nordeste', E: 'leste', SE: 'sudeste', S: 'sul', SO: 'sudoeste', O: 'oeste', NO: 'noroeste',
};

/** One grid cell as drawn in the report: no listing details, so the public link exposes only ranks. */
export interface ReportPoint {
  row: number;
  col: number;
  rank: number | null;
}

export interface RunSummary {
  ts: number;
  points: ReportPoint[];
  activePoints: number;
  /** Mean with 21 for "not in the top 20". */
  avgPosition: number | null;
  shareOfVoice: number;
  top3Points: number;
  top10Points: number;
  notFoundPoints: number;
  top3Pct: number;
  top10Pct: number;
}

export interface MetricDelta {
  /** Negative = moved up (better). */
  avgPosition: number | null;
  /** Percentage points. */
  shareOfVoice: number;
  top3Pct: number;
  top10Pct: number;
}

export interface AreaStat {
  points: number;
  avgPosition: number;
  top3Pct: number;
  top10Pct: number;
}

export interface SectorStat extends AreaStat {
  sector: Sector;
  previousAvgPosition: number | null;
}

export interface RingStat extends AreaStat {
  ring: number;
  distanceKm: number;
}

export interface Movement {
  comparable: number;
  improved: number;
  worsened: number;
  unchanged: number;
  enteredTop3: number;
  leftTop3: number;
  enteredTop10: number;
  leftTop10: number;
}

export interface CompetitorTop3 {
  name: string;
  top3Points: number;
  presentPoints: number;
  avgRank: number;
  /** Null when there is no previous scan. */
  previousTop3Points: number | null;
}

export interface KeywordReport {
  keyword: string;
  gridSize: number;
  spacingKm: number;
  /** `row:col` keys switched off by the user; drawn empty and left out of every number. */
  inactive: string[];
  current: RunSummary | null;
  previous: RunSummary | null;
  delta: MetricDelta | null;
  sectors: SectorStat[];
  rings: RingStat[];
  movement: Movement | null;
  competitors: CompetitorTop3[];
  /** Measured in the scans. */
  facts: string[];
  /** What is not known because a scan is missing. */
  missing: string[];
  /** Rule-based explanations to verify; never presented as findings. */
  hypotheses: string[];
  /** Proposed next steps, not completed actions. */
  recommendations: string[];
}

export interface ScanInput {
  ts: number;
  results: GridPoint[];
}

export interface KeywordInput {
  keyword: string;
  gridSize: number;
  spacingKm: number;
  inactive: ReadonlySet<string>;
  current: ScanInput | null;
  previous: ScanInput | null;
  monthLabel: string;
  previousMonthLabel: string;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const effective = (rank: number | null) => (rank === null || rank < 1 ? NOT_FOUND_RANK : Math.min(rank, NOT_FOUND_RANK));
const pct = (count: number, total: number) => (total > 0 ? round1((count / total) * 100) : 0);
const isTop3 = (rank: number | null) => rankBand(rank) === 'top3';
const isTop10 = (rank: number | null) => rankBand(rank) === 'top3' || rankBand(rank) === 'top10';

/** "2,5" in Brazilian notation. */
export function fmt(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** "+1,5" / "-2" / "0". */
export function signed(value: number): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '-'}${fmt(Math.abs(value))}`;
}

function activeOnly(results: GridPoint[], inactive: ReadonlySet<string>): GridPoint[] {
  return results.filter((point) => !inactive.has(pointKey(point)));
}

export function summarizeRun(scan: ScanInput, inactive: ReadonlySet<string>): RunSummary {
  const active = activeOnly(scan.results, inactive);
  const metrics = computeGradeMetrics(active);
  const top3Points = metrics.bandCounts.top3;
  const top10Points = metrics.bandCounts.top3 + metrics.bandCounts.top10;
  return {
    ts: scan.ts,
    points: active.map((point) => ({ row: point.row, col: point.col, rank: point.rank })),
    activePoints: metrics.activePoints,
    avgPosition: metrics.avgPosition,
    shareOfVoice: metrics.shareOfVoice,
    top3Points,
    top10Points,
    notFoundPoints: metrics.bandCounts.out,
    top3Pct: pct(top3Points, metrics.activePoints),
    top10Pct: pct(top10Points, metrics.activePoints),
  };
}

export function compareRuns(current: RunSummary, previous: RunSummary | null): MetricDelta | null {
  if (!previous || previous.activePoints === 0 || current.activePoints === 0) return null;
  return {
    avgPosition: current.avgPosition !== null && previous.avgPosition !== null ? round1(current.avgPosition - previous.avgPosition) : null,
    shareOfVoice: round1(current.shareOfVoice - previous.shareOfVoice),
    top3Pct: round1(current.top3Pct - previous.top3Pct),
    top10Pct: round1(current.top10Pct - previous.top10Pct),
  };
}

/** Compass sector of a cell; null for the center. Row 0 is the northern edge, column 0 the western one. */
export function sectorOf(point: Pick<ReportPoint, 'row' | 'col'>, gridSize: number): Sector | null {
  const half = Math.floor(gridSize / 2);
  const east = point.col - half;
  const north = half - point.row;
  if (east === 0 && north === 0) return null;
  const degrees = (Math.atan2(east, north) * 180) / Math.PI;
  const index = Math.round(((degrees + 360) % 360) / 45) % 8;
  return SECTORS[index];
}

export function ringOf(point: Pick<ReportPoint, 'row' | 'col'>, gridSize: number): number {
  const half = Math.floor(gridSize / 2);
  return Math.max(Math.abs(point.row - half), Math.abs(point.col - half));
}

function areaStat(points: ReportPoint[]): AreaStat {
  return {
    points: points.length,
    avgPosition: round1(points.reduce((sum, point) => sum + effective(point.rank), 0) / points.length),
    top3Pct: pct(points.filter((point) => isTop3(point.rank)).length, points.length),
    top10Pct: pct(points.filter((point) => isTop10(point.rank)).length, points.length),
  };
}

export function sectorStats(current: ReportPoint[], previous: ReportPoint[] | null, gridSize: number): SectorStat[] {
  const group = (points: ReportPoint[]) => {
    const bySector = new Map<Sector, ReportPoint[]>();
    for (const point of points) {
      const sector = sectorOf(point, gridSize);
      if (!sector) continue;
      bySector.set(sector, [...(bySector.get(sector) ?? []), point]);
    }
    return bySector;
  };
  const now = group(current);
  const before = previous ? group(previous) : null;
  return SECTORS.filter((sector) => now.has(sector)).map((sector) => {
    const earlier = before?.get(sector);
    return {
      sector,
      ...areaStat(now.get(sector)!),
      previousAvgPosition: earlier && earlier.length ? areaStat(earlier).avgPosition : null,
    };
  });
}

export function ringStats(points: ReportPoint[], gridSize: number, spacingKm: number): RingStat[] {
  const byRing = new Map<number, ReportPoint[]>();
  for (const point of points) {
    const ring = ringOf(point, gridSize);
    byRing.set(ring, [...(byRing.get(ring) ?? []), point]);
  }
  return [...byRing.entries()].sort((a, b) => a[0] - b[0])
    .map(([ring, ringPoints]) => ({ ring, distanceKm: round1(ring * spacingKm), ...areaStat(ringPoints) }));
}

export function pointMovement(current: ReportPoint[], previous: ReportPoint[]): Movement {
  const before = new Map(previous.map((point) => [pointKey(point), point.rank]));
  const movement: Movement = { comparable: 0, improved: 0, worsened: 0, unchanged: 0, enteredTop3: 0, leftTop3: 0, enteredTop10: 0, leftTop10: 0 };
  for (const point of current) {
    const key = pointKey(point);
    if (!before.has(key)) continue;
    const earlier = before.get(key) ?? null;
    movement.comparable += 1;
    const change = effective(point.rank) - effective(earlier);
    if (change < 0) movement.improved += 1;
    else if (change > 0) movement.worsened += 1;
    else movement.unchanged += 1;
    if (isTop3(point.rank) && !isTop3(earlier)) movement.enteredTop3 += 1;
    if (!isTop3(point.rank) && isTop3(earlier)) movement.leftTop3 += 1;
    if (isTop10(point.rank) && !isTop10(earlier)) movement.enteredTop10 += 1;
    if (!isTop10(point.rank) && isTop10(earlier)) movement.leftTop10 += 1;
  }
  return movement;
}

/** Competitors ordered by how many active points they hold in the top 3. */
export function topCompetitors(current: GridPoint[], previous: GridPoint[] | null, limit = 5): CompetitorTop3[] {
  const tally = (points: GridPoint[]) => {
    const byKey = new Map<string, { name: string; top3: number; ranks: number[] }>();
    for (const point of points) {
      const seen = new Set<string>();
      for (const item of point.items ?? []) {
        if (item.is_target) continue;
        const key = competitorKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const entry = byKey.get(key) ?? { name: item.title, top3: 0, ranks: [] };
        entry.ranks.push(item.rank_group);
        if (item.rank_group <= 3) entry.top3 += 1;
        byKey.set(key, entry);
      }
    }
    return byKey;
  };
  const now = tally(current);
  const before = previous ? tally(previous) : null;
  return [...now.entries()]
    .filter(([, entry]) => entry.top3 > 0)
    .map(([key, entry]) => ({
      name: entry.name,
      top3Points: entry.top3,
      presentPoints: entry.ranks.length,
      avgRank: round1(entry.ranks.reduce((sum, rank) => sum + rank, 0) / entry.ranks.length),
      previousTop3Points: before ? before.get(key)?.top3 ?? 0 : null,
    }))
    .sort((a, b) => b.top3Points - a.top3Points || b.presentPoints - a.presentPoints || a.avgRank - b.avgRank)
    .slice(0, limit);
}

const CARDINAL: Array<{ sector: Sector; edge: (point: ReportPoint, last: number) => boolean }> = [
  { sector: 'N', edge: (point) => point.row === 0 },
  { sector: 'S', edge: (point, last) => point.row === last },
  { sector: 'E', edge: (point, last) => point.col === last },
  { sector: 'O', edge: (point) => point.col === 0 },
];

/** Cardinal edges where most boundary points are already in the top 10 (sampling_review.py: directional probe). */
export function edgesReachingTop10(points: ReportPoint[], gridSize: number): Sector[] {
  if (gridSize < 3) return [];
  const last = gridSize - 1;
  return CARDINAL.filter(({ edge }) => {
    const boundary = points.filter((point) => edge(point, last));
    if (boundary.length === 0) return false;
    return boundary.filter((point) => isTop10(point.rank)).length * 2 >= boundary.length;
  }).map(({ sector }) => sector);
}

const sectorList = (sectors: SectorStat[]) =>
  sectors.map((stat) => `${stat.sector} (${fmt(stat.avgPosition)} em ${stat.points} ${stat.points === 1 ? 'ponto' : 'pontos'})`).join(', ');

const names = (sectors: Sector[]) => sectors.map((sector) => SECTOR_NAMES[sector]).join(', ');

/** Builds the full comparison for one keyword. */
export function analyzeKeyword(input: KeywordInput): KeywordReport {
  const current = input.current ? summarizeRun(input.current, input.inactive) : null;
  const previous = input.previous ? summarizeRun(input.previous, input.inactive) : null;
  const report: KeywordReport = {
    keyword: input.keyword,
    gridSize: input.gridSize,
    spacingKm: input.spacingKm,
    inactive: [...input.inactive].sort(),
    current,
    previous,
    delta: null,
    sectors: [],
    rings: [],
    movement: null,
    competitors: [],
    facts: [],
    missing: [],
    hypotheses: [],
    recommendations: [],
  };

  if (!current || current.activePoints === 0) {
    report.missing.push(`Nenhuma varredura concluída em ${input.monthLabel}: não há posição medida para este mês.`);
    if (!previous) report.missing.push(`Também não há varredura concluída em ${input.previousMonthLabel}.`);
    else report.facts.push(`Última medição disponível (${input.previousMonthLabel}): posição média ${previous.avgPosition === null ? '-' : fmt(previous.avgPosition)} e Share of Voice de ${fmt(previous.shareOfVoice)}%.`);
    report.recommendations.push('Conferir se a campanha estava ativa, se o teto de gastos bloqueou envios e se o worker estava rodando no período; sem varredura não há o que comparar.');
    return report;
  }

  const n = current.activePoints;
  const activeCurrent = activeOnly(input.current!.results, input.inactive);
  const activePrevious = previous ? activeOnly(input.previous!.results, input.inactive) : null;
  report.delta = compareRuns(current, previous);
  report.sectors = sectorStats(current.points, previous?.points ?? null, input.gridSize);
  report.rings = ringStats(current.points, input.gridSize, input.spacingKm);
  report.movement = previous ? pointMovement(current.points, previous.points) : null;
  report.competitors = topCompetitors(activeCurrent, activePrevious);
  const { delta, movement } = report;

  // Measured facts, always with their denominators.
  const avg = current.avgPosition ?? NOT_FOUND_RANK;
  let positionFact = `Posição média ${fmt(avg)} em ${input.monthLabel}, em ${n} pontos ativos (fora do top 20 conta como 21).`;
  if (previous && delta?.avgPosition != null) {
    const direction = delta.avgPosition < 0 ? 'melhora' : delta.avgPosition > 0 ? 'piora' : 'sem mudança';
    positionFact += ` Em ${input.previousMonthLabel} era ${fmt(previous.avgPosition!)} (${signed(delta.avgPosition)}, ${direction}).`;
  }
  report.facts.push(positionFact);
  report.facts.push(`Share of Voice de ${fmt(current.shareOfVoice)}%${previous && delta ? ` (antes ${fmt(previous.shareOfVoice)}%, ${signed(delta.shareOfVoice)} p.p.)` : ''}.`);
  report.facts.push(`Top 3 em ${current.top3Points} de ${n} pontos (${fmt(current.top3Pct)}%); top 10 em ${current.top10Points} de ${n} (${fmt(current.top10Pct)}%); fora do top 20 em ${current.notFoundPoints} de ${n}.`);
  if (movement && movement.comparable > 0) {
    report.facts.push(`Ponto a ponto (${movement.comparable} pontos comparáveis): ${movement.improved} melhoraram, ${movement.worsened} pioraram e ${movement.unchanged} ficaram iguais; ${movement.enteredTop3} entraram e ${movement.leftTop3} saíram do top 3.`);
  }

  const strong = report.sectors.filter((stat) => stat.avgPosition <= 3);
  const weak = report.sectors.filter((stat) => stat.avgPosition > 10);
  if (strong.length) report.facts.push(`Setores fortes (posição média até 3): ${sectorList(strong)}.`);
  if (weak.length) report.facts.push(`Setores fracos (posição média acima de 10): ${sectorList(weak)}.`);
  const fallen = report.sectors.filter((stat) => stat.previousAvgPosition !== null && stat.avgPosition - stat.previousAvgPosition >= 3);
  const risen = report.sectors.filter((stat) => stat.previousAvgPosition !== null && stat.previousAvgPosition - stat.avgPosition >= 3);
  if (risen.length) report.facts.push(`Setores que subiram 3 posições ou mais: ${risen.map((stat) => `${stat.sector} (de ${fmt(stat.previousAvgPosition!)} para ${fmt(stat.avgPosition)})`).join(', ')}.`);
  if (fallen.length) report.facts.push(`Setores que caíram 3 posições ou mais: ${fallen.map((stat) => `${stat.sector} (de ${fmt(stat.previousAvgPosition!)} para ${fmt(stat.avgPosition)})`).join(', ')}.`);

  const maxRing = report.rings.length ? report.rings[report.rings.length - 1].ring : 0;
  const coreRings = report.rings.filter((ring) => ring.ring <= Math.floor(maxRing / 2));
  const edgeRing = maxRing > 0 ? report.rings[report.rings.length - 1] : null;
  const corePoints = coreRings.reduce((sum, ring) => sum + ring.points, 0);
  const coreTop3 = corePoints > 0 ? round1(coreRings.reduce((sum, ring) => sum + (ring.top3Pct * ring.points) / 100, 0) / corePoints * 100) : 0;
  const coreReach = round1(Math.floor(maxRing / 2) * input.spacingKm);
  const decays = Boolean(edgeRing && coreTop3 - edgeRing.top3Pct >= 30);
  if (edgeRing) {
    report.facts.push(`Até ${fmt(coreReach)} km do centro: top 3 em ${fmt(coreTop3)}% de ${corePoints} pontos. No anel externo (${fmt(edgeRing.distanceKm)} km): top 3 em ${fmt(edgeRing.top3Pct)}% de ${edgeRing.points} pontos, posição média ${fmt(edgeRing.avgPosition)}.`);
  }

  const leader = report.competitors[0];
  if (leader) {
    report.facts.push(`Concorrente mais presente no top 3: ${leader.name}, em ${leader.top3Points} de ${n} pontos${leader.previousTop3Points !== null ? ` (antes ${leader.previousTop3Points})` : ''}.`);
  }

  if (!previous) report.missing.push(`Nenhuma varredura concluída em ${input.previousMonthLabel}: não há comparação com o mês anterior.`);

  // Hypotheses: plausible explanations to check, never conclusions.
  if (decays) {
    report.hypotheses.push(`A distância até o endereço parece pesar nesta busca: a presença no top 3 cai de ${fmt(coreTop3)}% perto do centro para ${fmt(edgeRing!.top3Pct)}% a ${fmt(edgeRing!.distanceKm)} km, onde empresas mais próximas tendem a aparecer.`);
  }
  if (weak.length && strong.length) {
    report.hypotheses.push(`Pode haver concorrentes mais próximos ou mais relevantes ao ${names(weak.map((stat) => stat.sector))}; a diferença entre setores não diz por si só qual é a causa.`);
  }
  if (leader && leader.top3Points * 2 >= n) {
    report.hypotheses.push(`${leader.name} ocupa o top 3 em metade ou mais dos pontos e pode ser a principal referência local para esta busca (categoria, avaliações ou proximidade, ainda não verificados).`);
  }
  if (current.notFoundPoints * 2 > n) {
    report.hypotheses.push('O perfil pode não estar sendo considerado relevante para este termo (categoria principal ou serviços), já que fica fora do top 20 na maioria dos pontos.');
  }
  if (delta?.avgPosition != null && delta.avgPosition >= 2) {
    report.hypotheses.push('A queda pode vir de mudança recente: concorrente novo, alteração no perfil ou mudança do próprio Google. Uma varredura isolada não distingue essas causas.');
  }
  if (delta?.avgPosition != null && delta.avgPosition <= -2) {
    report.hypotheses.push('As ações do período podem ter contribuído para a melhora, mas subir no ranking sozinho não prova causa nem resultado comercial.');
  }

  // Recommendations: proposed next steps, to be decided by the team.
  if (weak.length) {
    report.recommendations.push(`Ver quem ocupa o top 3 nos setores ${weak.map((stat) => stat.sector).join(', ')} e comparar categoria, avaliações e distância antes de mudar o perfil.`);
  }
  if (leader && leader.top3Points * 2 >= n) {
    report.recommendations.push(`Comparar o perfil de ${leader.name} com o do cliente (categoria principal, serviços, volume e nota de avaliações) para confirmar ou descartar a hipótese.`);
  }
  if (delta?.avgPosition != null && delta.avgPosition >= 2) {
    report.recommendations.push('Revisar o histórico de alterações do perfil e o que mudou entre as duas varreduras; repetir a varredura antes de tomar decisões grandes.');
  }
  const reaching = edgesReachingTop10(current.points, input.gridSize);
  if (reaching.length) {
    report.recommendations.push(`A visibilidade top 10 chega à borda da grade ao ${names(reaching)}. Se houver território relevante (clientes, área de atendimento), considerar uma sondagem pequena além dessa borda; é uma proposta, não uma varredura feita.`);
  }
  if (!previous) report.recommendations.push('Manter a cadência da campanha para ter base de comparação no próximo mês.');
  if (report.recommendations.length === 0) {
    report.recommendations.push('Sem mudança relevante: manter o monitoramento. Não alterar o perfil só com base nesta comparação.');
  }

  return report;
}

export interface CampaignReport {
  campaignName: string;
  target: string;
  gridSize: number;
  spacingKm: number;
  month: string;
  previousMonth: string;
  monthLabel: string;
  previousMonthLabel: string;
  generatedAt: number;
  keywords: KeywordReport[];
  summary: CampaignSummary;
}

export interface CampaignSummary {
  keywordCount: number;
  withCurrent: number;
  withPrevious: number;
  compared: number;
  /** Mean over keywords with a scan in the month. */
  avgPosition: number | null;
  shareOfVoice: number | null;
  /** Mean change over keywords with both scans. */
  avgPositionDelta: number | null;
  shareOfVoiceDelta: number | null;
  improved: string[];
  worsened: string[];
}

const mean = (values: number[]) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null);

export function summarizeCampaign(keywords: KeywordReport[]): CampaignSummary {
  const withCurrent = keywords.filter((keyword) => keyword.current && keyword.current.avgPosition !== null);
  const compared = keywords.filter((keyword) => keyword.delta && keyword.delta.avgPosition !== null);
  return {
    keywordCount: keywords.length,
    withCurrent: withCurrent.length,
    withPrevious: keywords.filter((keyword) => keyword.previous).length,
    compared: compared.length,
    avgPosition: mean(withCurrent.map((keyword) => keyword.current!.avgPosition!)),
    shareOfVoice: mean(withCurrent.map((keyword) => keyword.current!.shareOfVoice)),
    avgPositionDelta: mean(compared.map((keyword) => keyword.delta!.avgPosition!)),
    shareOfVoiceDelta: mean(compared.map((keyword) => keyword.delta!.shareOfVoice)),
    improved: compared.filter((keyword) => keyword.delta!.avgPosition! <= -1).map((keyword) => keyword.keyword),
    worsened: compared.filter((keyword) => keyword.delta!.avgPosition! >= 1).map((keyword) => keyword.keyword),
  };
}

/** Plain-text summary used by the monthly e-mail. */
export function reportSummaryLines(report: CampaignReport): string[] {
  const { summary } = report;
  const lines = [`${report.campaignName} (${report.target}) - ${report.monthLabel}`];
  if (summary.withCurrent === 0) {
    lines.push(`Nenhuma palavra-chave teve varredura concluída em ${report.monthLabel}.`);
  } else {
    lines.push(`Posição média ${fmt(summary.avgPosition!)} e Share of Voice de ${fmt(summary.shareOfVoice!)}% em ${summary.withCurrent} de ${summary.keywordCount} palavras-chave com varredura no mês.`);
    if (summary.compared > 0) {
      lines.push(`Contra ${report.previousMonthLabel} (${summary.compared} palavras-chave comparáveis): posição ${signed(summary.avgPositionDelta!)} e Share of Voice ${signed(summary.shareOfVoiceDelta!)} p.p. (posição negativa = subiu).`);
    } else {
      lines.push(`Sem varreduras em ${report.previousMonthLabel} para comparar.`);
    }
  }
  for (const keyword of report.keywords) {
    if (!keyword.current) {
      lines.push(`- ${keyword.keyword}: sem varredura em ${report.monthLabel}.`);
      continue;
    }
    const change = keyword.delta?.avgPosition != null ? ` (${signed(keyword.delta.avgPosition)})` : ' (sem comparação)';
    lines.push(`- ${keyword.keyword}: posição média ${fmt(keyword.current.avgPosition ?? NOT_FOUND_RANK)}${change}, top 3 em ${keyword.current.top3Points}/${keyword.current.activePoints} pontos.`);
  }
  return lines;
}
