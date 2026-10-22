import type { BrandStyle } from '@/lib/brand';
import type { GridPoint, GridSchedule, GridSearchEntry } from '@/lib/db';
import { formatDistance, type DistanceUnit } from '@/lib/grid-preferences';
import { computeGridSummary } from './grid-insights';
import { gridPointsHref } from '@/modules/grade/inactive-points';
import { GridSnapshotSelectionProvider, GridSelectedSnapshotExportButton } from './GridSnapshotSelection';
import GridScheduleControl from './GridScheduleControl';
import GridAnalysisPanel from './GridAnalysisPanel';
import DeleteMonitorButton from './DeleteMonitorButton';
import { type GridMapSnapshot } from './GridSnapshotMapPanel';
import { type GridPositionTrendPoint } from './GridPositionTrend';

type Props = {
  entry: GridSearchEntry;
  results: GridPoint[];
  previousResults: GridPoint[] | null;
  snapshots: GridMapSnapshot[];
  schedule: GridSchedule | null;
  brandName: string;
  brandLogoUrl?: string;
  brandColor?: string;
  brandFooter?: string;
  brandStyle?: Partial<BrandStyle>;
  trend: GridPositionTrendPoint[];
  distanceUnit: DistanceUnit;
  /** `row:col` keys switched off for this grid. */
  inactivePoints?: string[];
};

function metricDelta(current: number | null, previous: number | null, inverse = false) {
  if (current === null || previous === null) return null;
  const raw = inverse ? previous - current : current - previous;
  // Round to 1 decimal to avoid floating-point artifacts (e.g. 9.3 - 9.5 = -0.19999999999999929).
  const value = Math.round(raw * 10) / 10;
  if (value === 0) return 'Sem mudança';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR')}`;
}

export default function GridTimeline({ entry, results, previousResults, snapshots, schedule, brandName, brandLogoUrl, brandColor, brandFooter, brandStyle, trend, distanceUnit, inactivePoints = [] }: Props) {
  const current = computeGridSummary(results);
  const previous = previousResults ? computeGridSummary(previousResults) : null;
  const mapId = `geo-grid-report-map-${entry.id}`;
  const metrics = [
    { label: 'Visibilidade', value: `${current.ato}%`, delta: metricDelta(current.ato, previous?.ato ?? null), good: (current.ato - (previous?.ato ?? current.ato)) >= 0 },
    { label: 'Posição média', value: current.avgRank == null ? '—' : `#${current.avgRank.toLocaleString('pt-BR')}`, delta: metricDelta(current.avgRank, previous?.avgRank ?? null, true), good: (previous?.avgRank ?? current.avgRank ?? 0) - (current.avgRank ?? 0) >= 0 },
    { label: 'Top 3', value: String(current.top3Count), delta: metricDelta(current.top3Count, previous?.top3Count ?? null), good: (current.top3Count - (previous?.top3Count ?? current.top3Count)) >= 0 },
    { label: 'Encontrados', value: `${current.foundCount}/${current.totalPoints}`, delta: metricDelta(current.foundCount, previous?.foundCount ?? null), good: (current.foundCount - (previous?.foundCount ?? current.foundCount)) >= 0 },
  ];

  return (
    <GridSnapshotSelectionProvider selectedId={entry.id}>
    <section className="overflow-hidden rounded-nexo-lg border border-nexo-border bg-nexo-surface">
      <div className="border-b border-nexo-border bg-white/[0.02] px-5 py-4 sm:px-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="nexo-section">Monitor de posições</p>
            <h2 className="mt-1 text-xl font-medium tracking-tight text-nexo-text">{entry.keyword}</h2>
            <p className="mt-1 text-xs text-nexo-dim">{entry.target} · {entry.grid_size}×{entry.grid_size} pontos · espaçamento de {formatDistance(entry.spacing_km, distanceUnit)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/dashboard/geo-grid?keyword=${encodeURIComponent(entry.keyword)}&location_coordinate=${encodeURIComponent(entry.center)}&grid_size=${entry.grid_size}&spacing_km=${entry.spacing_km}&grid_target=${encodeURIComponent(entry.target)}&language=${encodeURIComponent(entry.language)}&queue_mode=${entry.queue_mode}&device=${entry.device ?? 'desktop'}&depth=${entry.depth ?? 20}&mode=grid`} className="nexo-section inline-flex items-center rounded-nexo-lg border border-nexo-border-strong bg-nexo-surface px-3 py-2 transition-colors hover:bg-nexo-blue/15">
              Executar agora
            </a>
            <a href={gridPointsHref(entry, `/dashboard/geo-grid?grid_history_id=${entry.id}#results`)} className="nexo-section inline-flex items-center rounded-nexo-lg border border-nexo-border-strong bg-nexo-surface px-3 py-2 transition-colors hover:bg-nexo-blue/15">
              Pontos{inactivePoints.length > 0 ? ` · ${inactivePoints.length} desligados` : ''}
            </a>
            <GridSelectedSnapshotExportButton snapshots={snapshots} fallbackResults={results} fallbackTs={entry.ts} gridSize={entry.grid_size} spacingKm={entry.spacing_km} keyword={entry.keyword} target={entry.target} language={entry.language} brandName={brandName} brandLogoUrl={brandLogoUrl} brandColor={brandColor} brandFooter={brandFooter} brandStyle={brandStyle} mapElementId={mapId} />
            <DeleteMonitorButton runId={entry.id} />
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-nexo-border pb-5 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <p className="nexo-label">{metric.label}</p>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-medium tabular-nums text-nexo-text">{metric.value}</span>{metric.delta && <span className={`text-[10px] font-medium ${metric.delta === 'Sem mudança' ? 'text-nexo-faint' : metric.good ? 'text-nexo-ice' : 'text-nexo-danger-text'}`}>{metric.delta}</span>}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-nexo-lg border border-nexo-border bg-white/[0.02] px-5">
          <GridScheduleControl runId={entry.id} schedule={schedule} />
        </div>

        <div className="mt-6">
          <GridAnalysisPanel
            snapshots={snapshots}
            selectedId={entry.id}
            gridSize={entry.grid_size}
            spacingKm={entry.spacing_km}
            keyword={entry.keyword}
            target={entry.target}
            language={entry.language}
            brandName={brandName}
            brandLogoUrl={brandLogoUrl}
            brandColor={brandColor}
            brandFooter={brandFooter} brandStyle={brandStyle}
            captureId={mapId}
            trend={trend}
            inactivePoints={inactivePoints}
          />
        </div>
      </div>
    </section>
    </GridSnapshotSelectionProvider>
  );
}
