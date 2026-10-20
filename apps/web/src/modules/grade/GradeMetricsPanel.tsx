'use client';

import { useMemo } from 'react';
import type { GridPoint } from '@/lib/db';
import { RANK_TIERS } from '@/lib/rank-scale';
import { BAND_ORDER, compareGradeMetrics, computeGradeMetrics, type RankBand } from './metrics';

type Props = {
  results: GridPoint[];
  previousResults: GridPoint[] | null;
  inactivePoints?: ReadonlySet<string>;
};

const BANDS: Record<RankBand, { label: string; color: string; higherIsBetter: boolean }> = {
  top3: { label: '#1-3', color: RANK_TIERS.top.swatch, higherIsBetter: true },
  top10: { label: '#4-10', color: RANK_TIERS.mid.swatch, higherIsBetter: true },
  top20: { label: '#11-20', color: RANK_TIERS.low.swatch, higherIsBetter: false },
  out: { label: 'Fora do top 20', color: RANK_TIERS.none.swatch, higherIsBetter: false },
};

function Delta({ value, unit = '', higherIsBetter }: { value: number | null | undefined; unit?: string; higherIsBetter: boolean }) {
  if (value === null || value === undefined) return null;
  if (value === 0) return <span className="text-[10px] font-medium text-nexo-faint">Sem mudança</span>;
  const good = higherIsBetter ? value > 0 : value < 0;
  return (
    <span className={`text-[10px] font-medium tabular-nums ${good ? 'text-nexo-ice' : 'text-nexo-danger-text'}`}>
      {value > 0 ? '+' : ''}{value.toLocaleString('pt-BR')}{unit}
    </span>
  );
}

/** Position, Share of Voice and band distribution for one scan, compared with the scan before it. */
export default function GradeMetricsPanel({ results, previousResults, inactivePoints }: Props) {
  const current = useMemo(() => computeGradeMetrics(results, inactivePoints), [results, inactivePoints]);
  const delta = useMemo(
    () => compareGradeMetrics(current, previousResults ? computeGradeMetrics(previousResults, inactivePoints) : null),
    [current, previousResults, inactivePoints],
  );

  if (current.activePoints === 0) return null;

  return (
    <section className="mt-6 rounded-nexo-lg border border-nexo-border bg-nexo-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="nexo-section">Métricas da grade</p>
          <h3 className="mt-1 text-sm font-medium text-nexo-text">Posição, Share of Voice e distribuição</h3>
        </div>
        <span className="text-[10px] font-medium text-nexo-faint">
          {delta ? 'Variação em relação à varredura anterior' : 'Primeira varredura, ainda sem comparação'} · {current.activePoints} {current.activePoints === 1 ? 'ponto ativo' : 'pontos ativos'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_2fr]">
        <div>
          <p className="nexo-label">Posição média</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-medium tabular-nums text-nexo-text">{current.avgPosition?.toLocaleString('pt-BR') ?? '—'}</span>
            <Delta value={delta?.avgPosition} higherIsBetter={false} />
          </div>
          <p className="mt-0.5 text-[10px] text-nexo-faint">21 onde não está no top 20</p>
        </div>
        <div>
          <p className="nexo-label">Share of Voice</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-medium tabular-nums text-nexo-text">{current.shareOfVoice}%</span>
            <Delta value={delta?.shareOfVoice} unit=" p.p." higherIsBetter />
          </div>
          <p className="mt-0.5 text-[10px] text-nexo-faint">Com peso maior para o top 3</p>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <p className="nexo-label">Distribuição</p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-nexo-surface-2" role="img" aria-label="Proporção de pontos por faixa de posição">
            {BAND_ORDER.map((band) => (
              current.bands[band] > 0 && <div key={band} style={{ width: `${current.bands[band]}%`, backgroundColor: BANDS[band].color }} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {BAND_ORDER.map((band) => (
              <div key={band} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: BANDS[band].color }} />
                <span className="font-semibold text-nexo-dim">{BANDS[band].label}</span>
                <span className="ml-auto font-medium tabular-nums text-nexo-text">{current.bands[band]}%</span>
                <span className="w-12 text-right"><Delta value={delta?.bands[band]} unit=" p.p." higherIsBetter={BANDS[band].higherIsBetter} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
