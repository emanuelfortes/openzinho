'use client';

import { useMemo } from 'react';
import type { GridPoint } from '@/lib/db';
import { rankStyle } from '@/lib/rank-scale';
import { compareWithCompetitors } from './comparison';

type Props = {
  results: GridPoint[];
  gridSize: number;
  target: string;
  competitors: Array<{ key: string; name: string }>;
};

function RankGrid({ points, gridSize }: { points: GridPoint[]; gridSize: number }) {
  const byKey = new Map(points.map((point) => [`${point.row}:${point.col}`, point]));
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
      {Array.from({ length: gridSize * gridSize }, (_, index) => {
        const point = byKey.get(`${Math.floor(index / gridSize)}:${index % gridSize}`);
        if (!point) return <span key={index} className="aspect-square" />;
        const style = rankStyle(point.rank);
        return (
          <span
            key={index}
            className="grid aspect-square place-items-center rounded-[3px] font-mono text-[10px] leading-none"
            style={{ background: style.fill, color: style.text, border: style.border || undefined }}
          >
            {point.rank != null && point.rank <= 20 ? point.rank : ''}
          </span>
        );
      })}
    </div>
  );
}

/** The client and up to three competitors side by side, read from the same scan. */
export default function CompetitorComparison({ results, gridSize, target, competitors }: Props) {
  const compared = useMemo(() => compareWithCompetitors(results, target, competitors), [results, target, competitors]);
  if (compared.length < 2) return null;

  return (
    <section className="nexo-panel p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="nexo-section">Comparativo</p>
          <h3 className="mt-1 text-sm font-medium text-nexo-text">Cliente e principais concorrentes na mesma grade</h3>
        </div>
        <span className="text-[11px] text-nexo-faint">Mesma varredura, sem custo extra</span>
      </div>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        {compared.map((business) => (
          <div key={business.key} className={`rounded-nexo-lg border p-3 ${business.isTarget ? 'border-nexo-ice/40 bg-nexo-ice/5' : 'border-nexo-border bg-nexo-surface-2'}`}>
            <p className={`truncate text-sm font-medium ${business.isTarget ? 'text-nexo-ice' : 'text-nexo-text'}`} title={business.name}>
              {business.isTarget ? 'Cliente · ' : ''}{business.name}
            </p>
            <div className="mt-1 mb-3 flex gap-4 text-[11px] text-nexo-dim">
              <span>Posição média <b className="font-mono font-medium text-nexo-ice">{business.metrics.avgPosition?.toLocaleString('pt-BR') ?? '—'}</b></span>
              <span>SoV <b className="font-mono font-medium text-nexo-ice">{business.metrics.shareOfVoice.toLocaleString('pt-BR')}%</b></span>
            </div>
            <RankGrid points={business.points} gridSize={gridSize} />
          </div>
        ))}
      </div>
    </section>
  );
}
