'use client';

import type { BrandStyle } from '@/lib/brand';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import { computeCompetitors, computeGridSummary, computeRingStats, type CompetitorSummary } from './grid-insights';
import GridPdfExportButton from './GridPdfExportButton';
import { formatDistance } from '@/lib/grid-preferences';
import { useGridPreferences } from './GridPreferences';

const GridMap = lazy(() => import('./GridMap'));

interface Props {
  results: GridPoint[];
  gridSize: number;
  spacingKm: number;
  keyword: string;
  target: string;
  cost?: number;
  language: string;
  searchedAt: number;
  snapshotDate?: number;
  brandName: string;
  brandLogoUrl?: string;
  brandColor?: string;
  brandFooter?: string;
  brandStyle?: Partial<BrandStyle>;
}

function rankColor(rank: number | null): string {
  if (rank === null) return '#94a3b8';
  if (rank === 1)    return '#059669';
  if (rank <= 3)     return '#10b981';
  if (rank <= 7)     return '#14b8a6';
  if (rank <= 10)    return '#3b82f6';
  if (rank <= 15)    return '#f59e0b';
  if (rank <= 20)    return '#f97316';
  return '#ef4444';
}

function formatSnapshotDate(ts: number) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(ts));
}

export default function GridResults({ results, gridSize, spacingKm, keyword, target, cost, language, searchedAt, snapshotDate, brandName, brandLogoUrl, brandColor, brandFooter, brandStyle }: Props) {
  const [highlight, setHighlight] = useState<CompetitorSummary | null>(null);
  const { distanceUnit, pinStyle } = useGridPreferences();
  const swatchShape = pinStyle === 'square' ? 'rounded-sm' : 'rounded-full';

  // A competitor key belongs to one snapshot. Clear it when the timeline moves
  // to another run, so the map and competitor list cannot describe different dates.
  useEffect(() => setHighlight(null), [results]);

  const { foundCount, top3Count: top3, top10Count: top10, avgRank, ato } = computeGridSummary(results);

  const competitors = useMemo(() => computeCompetitors(results), [results]);
  const topCompetitors = competitors.slice(0, 5);
  const ringStats = useMemo(() => computeRingStats(results, gridSize, spacingKm), [results, gridSize, spacingKm]);

  const legend = [
    { color: '#059669', label: '#1' },
    { color: '#10b981', label: '#2-3' },
    { color: '#14b8a6', label: '#4-7' },
    { color: '#3b82f6', label: '#8-10' },
    { color: '#f59e0b', label: '#11-15' },
    { color: '#f97316', label: '#16-20' },
    { color: '#ef4444', label: '#21+' },
    { color: '#94a3b8', label: 'Not found' },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="nexo-label">ATO Score</p>
          <p className="nexo-metric font-mono text-2xl mt-0.5 tabular-nums">{ato}%</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">Local visibility</p>
        </div>
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="nexo-label">Avg rank</p>
          <p className="nexo-metric font-mono text-2xl mt-0.5 tabular-nums">{avgRank ?? '—'}</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">{foundCount}/{results.length} points found</p>
        </div>
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice">Top 3</p>
          <p className="nexo-metric font-mono text-2xl text-nexo-ice mt-0.5 tabular-nums">{top3}</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">of {results.length} points</p>
        </div>
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="nexo-section">Top 10</p>
          <p className="nexo-metric font-mono text-2xl text-nexo-sky mt-0.5 tabular-nums">{top10}</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">of {results.length} points</p>
        </div>
      </div>

      {/* Competitive landscape */}
      {topCompetitors.length > 0 && (
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-nexo-text">Competitive landscape</p>
            <p className="text-[10px] text-nexo-faint">Ranked by grid presence</p>
          </div>
          <p className="text-[11px] text-nexo-faint mb-4">
            {snapshotDate ? `Snapshot from ${formatSnapshotDate(snapshotDate)} · ` : ''}Businesses appearing in the top 20 across the grid, compared to your own visibility.
          </p>

          <div className="space-y-2">
            {/* Target row, for direct comparison */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-nexo-lg bg-nexo-ice/10 border border-nexo-ice/30">
              <span className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice w-14 shrink-0">You</span>
              <span className="text-sm font-medium text-nexo-text flex-1 min-w-0 truncate">{target}</span>
              <div className="flex-1 max-w-[120px] h-2 bg-nexo-ice/10 rounded-full overflow-hidden hidden sm:block">
                <div className="h-full bg-nexo-ice" style={{ width: `${ato}%` }} />
              </div>
              <span className="text-xs font-medium text-nexo-ice tabular-nums w-10 text-right">{ato}%</span>
            </div>

            {topCompetitors.map((c, i) => {
              const isActive = highlight?.key === c.key;
              return (
                <div
                  key={c.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-nexo-lg border transition-colors ${
                    isActive
                      ? 'bg-nexo-blue/10 border-nexo-border-strong'
                      : 'bg-white/[0.02] border-transparent'
                  }`}
                >
                  <span className="nexo-label w-14 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-nexo-text truncate">{c.name}</p>
                    <p className="text-[10px] text-nexo-faint truncate">
                      {c.appearances}/{c.totalPoints} points · avg #{c.avgRank}
                      {c.avgRating != null ? ` · ★${c.avgRating.toFixed(1)}` : ''}
                    </p>
                  </div>
                  <div className="flex-1 max-w-[120px] h-2 bg-white/10 rounded-full overflow-hidden hidden sm:block">
                    <div className="h-full bg-nexo-blue" style={{ width: `${c.visibilityScore}%` }} />
                  </div>
                  <span className="text-xs font-medium text-nexo-dim tabular-nums w-10 text-right">{c.visibilityScore}%</span>
                  <button
                    type="button"
                    onClick={() => setHighlight(isActive ? null : c)}
                    className={`text-[10px] font-medium uppercase tracking-widest px-2.5 py-1.5 rounded-nexo shrink-0 transition-colors ${
                      isActive
                        ? 'bg-nexo-blue text-white'
                        : 'bg-nexo-surface text-nexo-sky border border-nexo-border-strong hover:bg-nexo-blue/15'
                    }`}
                  >
                    {isActive ? 'Showing ✓' : 'View on grid'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Map card */}
      <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-medium text-nexo-text">
              {highlight ? highlight.name : keyword}
            </p>
            <p className="text-[11px] text-nexo-faint mt-0.5">
              {highlight ? (
                <>Competitor · avg #{highlight.avgRank} · {highlight.appearances}/{highlight.totalPoints} points</>
              ) : (
                <>Target: <span className="font-medium text-nexo-dim">{target}</span></>
              )}
              {' · '}{gridSize}×{gridSize} points
            </p>
          </div>
          <div className="flex items-center gap-3">
            <GridPdfExportButton
              results={results}
              gridSize={gridSize}
              spacingKm={spacingKm}
              keyword={keyword}
              target={target}
              language={language}
              searchedAt={searchedAt}
              brandName={brandName}
              brandLogoUrl={brandLogoUrl}
              brandColor={brandColor}
              brandFooter={brandFooter} brandStyle={brandStyle}
            />
            {cost !== undefined && (
              <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>
            )}
            {highlight ? (
              <button
                type="button"
                onClick={() => setHighlight(null)}
                className="nexo-section bg-nexo-blue/10 px-2 py-1 rounded-nexo hover:bg-nexo-blue/15 transition-colors"
              >
                ← Back to target
              </button>
            ) : (
              <span className="text-[10px] font-medium text-nexo-faint bg-nexo-surface-2 px-2 py-1 rounded-nexo">
                Click a pin for details
              </span>
            )}
          </div>
        </div>

        {/* Mini legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 ${swatchShape}`} style={{ backgroundColor: item.color }} />
              <span className="text-[10px] font-medium text-nexo-dim">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-nexo-border">
            <div className={`w-3 h-3 ${swatchShape} border-2 border-dashed border-nexo-border-strong`} />
            <span className="text-[10px] font-medium text-nexo-dim">Center</span>
          </div>
        </div>

        {/* Map */}
        <Suspense fallback={
          <div className="w-full rounded-nexo-lg bg-nexo-surface-2 animate-pulse flex items-center justify-center" style={{ height: 520 }}>
            <p className="text-sm text-nexo-faint font-medium">Loading map…</p>
          </div>
        }>
          <GridMap
            key={highlight?.key ?? 'target'}
            points={results}
            gridSize={gridSize}
            target={target}
            highlightKey={highlight?.key}
            highlightName={highlight?.name}
          />
        </Suspense>
      </div>

      {/* Visibility by distance from center */}
      {ringStats.length > 1 && (
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-5">
          <p className="text-sm font-medium text-nexo-text mb-1">Visibility by distance</p>
          <p className="text-[11px] text-nexo-faint mb-4">
            How far from the center point the target stays visible — useful to see the real edge of your service area.
          </p>
          <div className="space-y-2">
            {ringStats.map((r) => (
              <div key={r.ring} className="flex items-center gap-3">
                <span className="text-[10px] font-medium text-nexo-faint w-20 shrink-0 tabular-nums">
                  {r.ring === 0 ? 'Center' : `~${formatDistance(r.distanceKm, distanceUnit, 1)}`}
                </span>
                <div className="flex-1 h-2.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${r.top3Pct >= 50 ? 'bg-nexo-ice' : r.foundCount > 0 ? 'bg-nexo-warn' : 'bg-white/20'}`}
                    style={{ width: `${Math.round((r.foundCount / r.pointCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-nexo-dim w-28 shrink-0 text-right tabular-nums">
                  {r.avgRank != null ? `avg #${r.avgRank}` : 'not found'}
                </span>
                <span className="text-[10px] text-nexo-faint w-16 shrink-0 text-right tabular-nums">
                  {r.foundCount}/{r.pointCount} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rank distribution mini-grid (fallback for points without geo) */}
      {results.some((p) => p.lat == null) && (
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-5">
          <p className="nexo-label mb-3">Distribution (grid without coordinates)</p>
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
            {results.map((p, i) => {
              const color = rankColor(p.rank);
              const half = Math.floor(gridSize / 2);
              const isCenter = p.row === half && p.col === half;
              return (
                <div
                  key={i}
                  title={p.rank != null ? `#${p.rank}` : 'Not found'}
                  style={{
                    width: 36, height: 36,
                    background: color,
                    borderRadius: 6,
                    border: isCenter ? '2px dashed rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: 'white',
                  }}
                >
                  {p.rank ?? '—'}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
