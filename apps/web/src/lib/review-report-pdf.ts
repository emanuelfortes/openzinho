// Turns a ComparisonReport into the sections of the white-label PDF (A4 landscape).
import type { ReportMetric, ReportSection } from '@/components/ReportPdfExportButton';
import type { PdfCell } from './report-pdf-blocks';
import {
  CRITERIA, CRITERION_GROUPS, formatCriterion, rankColor, seriesColors, type ComparisonReport, type CriterionId, type ListingResult,
} from './review-report';

const MUTED_CELL: PdfCell = { text: 'n/d', color: [148, 163, 184] };

function formatDay(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(ms));
}

function listingLabel(listing: ListingResult): string {
  return `${listing.title}${listing.isSelf ? ' (você)' : ''}${listing.partial ? ' *' : ''}`;
}

function rankCell(rank: number | null, count: number): PdfCell {
  if (rank === null) return MUTED_CELL;
  return { text: String(rank), fill: rankColor(rank, count) };
}

function valueWithRank(listing: ListingResult, id: CriterionId): PdfCell {
  const rank = listing.ranks[id];
  if (rank === null) return MUTED_CELL;
  // A position already is a rank: do not repeat it.
  if (id === 'mapsRank') return { text: formatCriterion(id, listing.metrics[id]), bold: rank === 1 };
  return { text: `${formatCriterion(id, listing.metrics[id])}  #${rank}`, bold: rank === 1 };
}

export function comparisonReportMetrics(report: ComparisonReport): ReportMetric[] {
  return report.kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, detail: kpi.detail }));
}

export function comparisonReportSections(report: ComparisonReport, context: { keyword: string; area: string }): ReportSection[] {
  const n = report.listings.length;
  const colors = seriesColors(report.listings);
  const partialNote = report.listings.some((l) => l.partial)
    ? '* Os dados deste perfil não alcançam o início do período (mais de 4.490 avaliações recentes ou uma coleta ainda em andamento).'
    : undefined;
  const sections: ReportSection[] = [];

  sections.push({ title: 'Resumo', rows: [], paragraphs: report.summary.headline });
  if (report.summary.targets.length) sections.push({ title: 'Metas e diferenças', rows: [], paragraphs: report.summary.targets });
  // Five of each keeps the first page self-contained; the web view lists them all.
  const strengths = report.summary.strengths.slice(0, 5);
  const weaknesses = report.summary.weaknesses.slice(0, 5);
  if (strengths.length || weaknesses.length) {
    sections.push({
      title: 'Pontos fortes e fracos',
      rows: [],
      table: {
        columns: [{ label: 'Pontos fortes: terço superior do mercado' }, { label: 'Pontos fracos: terço inferior do mercado' }],
        rows: Array.from({ length: Math.max(strengths.length, weaknesses.length) }, (_, i) => ({
          cells: [
            strengths[i] ? { text: strengths[i], color: [21, 128, 61] as [number, number, number] } : '',
            weaknesses[i] ? { text: weaknesses[i], color: [185, 28, 28] as [number, number, number] } : '',
          ],
        })),
      },
    });
  }

  sections.push({
    title: 'Ranking geral',
    rows: [],
    pageBreakBefore: true,
    table: {
      columns: [
        { label: '#', width: 0.5, align: 'center' }, { label: 'Perfil', width: 4 }, { label: 'Pontuação', width: 1, align: 'right' },
        { label: 'Avaliações / semana', width: 1.3, align: 'right' }, { label: 'Por mês', width: 1.1, align: 'right' },
        { label: 'Aceleração', width: 1.1, align: 'right' }, { label: 'Nota recente', width: 1.2, align: 'right' },
        { label: 'Taxa de resp.', width: 1.1, align: 'right' }, { label: 'Total no Google', width: 1.1, align: 'right' },
      ],
      rows: report.listings.map((l) => ({
        highlight: l.isSelf,
        cells: [
          rankCell(l.overallRank, n), listingLabel(l), l.score === null ? 'n/d' : `${Math.round(l.score)}/100`,
          formatCriterion('perWeek4', l.metrics.perWeek4), formatCriterion('perMonth', l.metrics.perMonth),
          formatCriterion('momentum', l.metrics.momentum), formatCriterion('recentRating', l.metrics.recentRating),
          formatCriterion('replyRate', l.metrics.replyRate), formatCriterion('googleTotal', l.metrics.googleTotal),
        ],
      })),
      note: [
        'Pontuação: média ponderada das notas min-max (0 = pior, 100 = melhor deste mercado). Pesos: ' +
          CRITERIA.filter((c) => c.weight > 0).map((c) => `${c.short} ${c.weight}%`).join(', ') + '. Valores ausentes ficam de fora e o peso deles é redistribuído.',
        partialNote,
      ].filter(Boolean).join(' '),
    },
  });

  sections.push({
    title: 'Matriz de posições (1 = melhor)',
    rows: [],
    table: {
      columns: [{ label: 'Perfil', width: 2.6 }, ...CRITERIA.map((c) => ({ label: c.short, width: 1, align: 'center' as const }))],
      rows: report.listings.map((l) => ({ highlight: l.isSelf, cells: [listingLabel(l), ...CRITERIA.map((c) => rankCell(l.ranks[c.id], n))] })),
    },
  });

  for (const group of CRITERION_GROUPS) {
    const criteria = CRITERIA.filter((c) => c.group === group);
    sections.push({
      title: group,
      rows: [],
      table: {
        columns: [{ label: 'Perfil', width: 2.6 }, ...criteria.map((c) => ({ label: c.label, width: 1.4, align: 'right' as const }))],
        rows: report.listings.map((l) => ({ highlight: l.isSelf, cells: [listingLabel(l), ...criteria.map((c) => valueWithRank(l, c.id))] })),
        note: criteria.map((c) => `${c.label}: ${c.description}`).join(' '),
      },
    });
  }

  const completeWeeks = report.weeks.slice(0, -1);
  sections.push({
    title: 'Novas avaliações por semana',
    rows: [],
    chart: {
      kind: 'line',
      labels: completeWeeks.map((w) => w.label),
      series: report.listings.map((l) => ({ name: l.title, values: l.weekly.slice(0, -1), color: colors.get(l.id)!, emphasis: l.isSelf })),
      height: 70,
    },
  });
  sections.push({
    title: 'Média de avaliações por semana, últimas 4 semanas completas',
    rows: [],
    chart: {
      kind: 'bar',
      bars: [...report.listings]
        .sort((a, b) => (b.metrics.perWeek4 ?? -1) - (a.metrics.perWeek4 ?? -1))
        .map((l) => ({ label: listingLabel(l), value: l.metrics.perWeek4, display: formatCriterion('perWeek4', l.metrics.perWeek4), color: colors.get(l.id), emphasis: l.isSelf })),
    },
  });

  sections.push({
    title: 'Metodologia',
    rows: [
      ['Mercado', `${context.keyword} · ${context.area}`],
      ['Período analisado', `${formatDay(report.periodStart, report.timeZone)} – ${formatDay(report.periodEnd, report.timeZone)} (${report.timeZone})`],
      ['Perfis comparados', String(n)],
      ['Avaliações analisadas', report.listings.map((l) => `${l.title}: ${l.reviewsInPeriod}`).join(' · ')],
      ['Fonte', 'Avaliações do Google via DataForSEO, das mais recentes para as mais antigas, datadas pela publicação'],
      ['Semanas', 'Semanas ISO (de segunda a domingo); a semana e o mês atuais ficam fora das médias'],
      ['Taxa de resposta', 'Conta só avaliações com mais de 7 dias, para que as recentes não pesem contra o proprietário'],
      ['Amostra mínima', 'Notas e frações exigem pelo menos 5 avaliações no período (3 avaliações negativas para a taxa de resposta em negativas)'],
    ],
  });
  return sections;
}
