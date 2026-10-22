'use client';

import type { BrandStyle } from '@/lib/brand';

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import { computeCompetitors, computeGridSummary, computeRingStats, type CompetitorSummary } from './grid-insights';
import GridPdfExportButton from './GridPdfExportButton';
import ExportCSVButton from '@/components/ExportCSVButton';
import CompetitorComparison from '@/modules/grade/CompetitorComparison';
import { GRID_CSV_COLUMNS, gridCsvFilename, gridCsvRows } from '@/modules/grade/grid-csv';
import { formatDistance } from '@/lib/grid-preferences';
import { RANK_TIER_ORDER, RANK_TIERS, rankStyle } from '@/lib/rank-scale';
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

function formatSnapshotDate(ts: number) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(ts));
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
  const comparisonCandidates = useMemo(() => competitors.slice(0, 10).map((c) => ({ key: c.key, name: c.name })), [competitors]);
  const ringStats = useMemo(() => computeRingStats(results, gridSize, spacingKm), [results, gridSize, spacingKm]);

  const legend = RANK_TIER_ORDER.map((tier) => ({ tier, ...RANK_TIERS[tier] }));

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="nexo-label">Pontuação ATO</p>
          <p className="nexo-metric font-mono text-2xl mt-0.5 tabular-nums">{ato}%</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">Visibilidade local</p>
        </div>
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="nexo-label">Posição média</p>
          <p className="nexo-metric font-mono text-2xl mt-0.5 tabular-nums">{avgRank?.toLocaleString('pt-BR') ?? '—'}</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">{foundCount}/{results.length} pontos encontrados</p>
        </div>
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice">Top 3</p>
          <p className="nexo-metric font-mono text-2xl text-nexo-ice mt-0.5 tabular-nums">{top3}</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">de {results.length} pontos</p>
        </div>
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg px-4 py-3">
          <p className="nexo-section">Top 10</p>
          <p className="nexo-metric font-mono text-2xl text-nexo-sky mt-0.5 tabular-nums">{top10}</p>
          <p className="text-[10px] text-nexo-faint mt-0.5">de {results.length} pontos</p>
        </div>
      </div>

      {/* Competitive landscape */}
      {topCompetitors.length > 0 && (
        <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-nexo-text">Cenário competitivo</p>
            <p className="text-[10px] text-nexo-faint">Ordenado por presença na grade</p>
          </div>
          <p className="text-[11px] text-nexo-faint mb-4">
            {snapshotDate ? `Varredura de ${formatSnapshotDate(snapshotDate)} · ` : ''}Empresas que aparecem no top 20 ao longo da grade, comparadas à sua própria visibilidade.
          </p>

          <div className="space-y-2">
            {/* Target row, for direct comparison */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-nexo-lg bg-nexo-ice/10 border border-nexo-ice/30">
              <span className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice w-14 shrink-0">Você</span>
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
                      {c.appearances}/{c.totalPoints} pontos · média #{c.avgRank.toLocaleString('pt-BR')}
                      {c.avgRating != null ? ` · ★${c.avgRating.toFixed(1).replace('.', ',')}` : ''}
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
                    {isActive ? 'Exibindo ✓' : 'Ver na grade'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CompetitorComparison results={results} gridSize={gridSize} target={target} competitors={comparisonCandidates} />

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
                <>Concorrente · média #{highlight.avgRank.toLocaleString('pt-BR')} · {highlight.appearances}/{highlight.totalPoints} pontos</>
              ) : (
                <>Alvo: <span className="font-medium text-nexo-dim">{target}</span></>
              )}
              {' · '}{gridSize}×{gridSize} pontos
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
            <ExportCSVButton data={gridCsvRows(results)} columns={GRID_CSV_COLUMNS} filename={gridCsvFilename(keyword, searchedAt)} />
            {cost !== undefined && (
              <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>
            )}
            {highlight ? (
              <button
                type="button"
                onClick={() => setHighlight(null)}
                className="nexo-section bg-nexo-blue/10 px-2 py-1 rounded-nexo hover:bg-nexo-blue/15 transition-colors"
              >
                ← Voltar ao alvo
              </button>
            ) : (
              <span className="text-[10px] font-medium text-nexo-faint bg-nexo-surface-2 px-2 py-1 rounded-nexo">
                Clique em um pino para ver detalhes
              </span>
            )}
          </div>
        </div>

        {/* Mini legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {legend.map((item) => (
            <div key={item.tier} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 ${swatchShape}`} style={{ background: item.fill, border: item.border || undefined, boxShadow: item.glow || undefined }} />
              <span className="text-[10px] font-medium text-nexo-dim">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-nexo-border">
            <div className={`w-3 h-3 ${swatchShape} border-2 border-dashed border-nexo-border-strong`} />
            <span className="text-[10px] font-medium text-nexo-dim">Centro</span>
          </div>
        </div>

        {/* Map */}
        <Suspense fallback={
          <div className="w-full rounded-nexo-lg bg-nexo-surface-2 animate-pulse flex items-center justify-center" style={{ height: 520 }}>
            <p className="text-sm text-nexo-faint font-medium">Carregando mapa…</p>
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
          <p className="text-sm font-medium text-nexo-text mb-1">Visibilidade por distância</p>
          <p className="text-[11px] text-nexo-faint mb-4">
            Até que distância do ponto central o alvo continua visível — útil para ver o limite real da sua área de atendimento.
          </p>
          <div className="space-y-2">
            {ringStats.map((r) => (
              <div key={r.ring} className="flex items-center gap-3">
                <span className="text-[10px] font-medium text-nexo-faint w-20 shrink-0 tabular-nums">
                  {r.ring === 0 ? 'Centro' : `~${formatDistance(r.distanceKm, distanceUnit, 1)}`}
                </span>
                <div className="flex-1 h-2.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${r.top3Pct >= 50 ? 'bg-nexo-ice' : r.foundCount > 0 ? 'bg-nexo-warn' : 'bg-white/20'}`}
                    style={{ width: `${Math.round((r.foundCount / r.pointCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-nexo-dim w-28 shrink-0 text-right tabular-nums">
                  {r.avgRank != null ? `média #${r.avgRank.toLocaleString('pt-BR')}` : 'não encontrado'}
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
          <p className="nexo-label mb-3">Distribuição (grade sem coordenadas)</p>
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
            {results.map((p, i) => {
              const style = rankStyle(p.rank);
              const half = Math.floor(gridSize / 2);
              const isCenter = p.row === half && p.col === half;
              return (
                <div
                  key={i}
                  title={p.rank != null ? `#${p.rank}` : 'Não encontrado'}
                  style={{
                    width: 36, height: 36,
                    background: style.fill,
                    borderRadius: 4,
                    border: isCenter ? '2px dashed rgba(194,224,255,0.9)' : style.border || '1px solid rgba(3,5,8,0.55)',
                    boxShadow: style.glow || undefined,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 500, color: style.text, fontFamily: 'var(--font-geist-mono), monospace',
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
