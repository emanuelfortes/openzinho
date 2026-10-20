'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import GridMap from './GridMap';
import GridPositionTrend, { type GridPositionTrendPoint } from './GridPositionTrend';

export type GridMapSnapshot = {
  id: string;
  ts: number;
  status: string;
  visibility: number | null;
  cost?: number;
  results: GridPoint[];
  previousResults: GridPoint[] | null;
};

type Props = {
  snapshots: GridMapSnapshot[];
  selectedId: string;
  gridSize: number;
  target: string;
  captureId: string;
  trend: GridPositionTrendPoint[];
  onSelectedIdChange?: (id: string) => void;
};

const STATUS_LABEL: Record<string, string> = { done: 'Concluída', pending: 'Pendente', error: 'Falhou' };

function formatSnapshotDate(ts: number) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(ts));
}

export default function GridSnapshotMapPanel({ snapshots, selectedId, gridSize, target, captureId, trend, onSelectedIdChange }: Props) {
  const [activeId, setActiveId] = useState(selectedId);

  // Changing monitor from the sidebar is a genuine new context. Date comparison below is local,
  // deliberately avoiding a route navigation so Leaflet keeps the current pan and zoom.
  useEffect(() => setActiveId(selectedId), [selectedId]);

  const activeSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === activeId) ?? snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0],
    [activeId, selectedId, snapshots],
  );

  if (!activeSnapshot) return null;

  return (
    <section>
      <GridPositionTrend points={trend} selectedId={activeSnapshot.id} />

      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-nexo-text">Mapa de posições</h3>
          <p className="mt-0.5 text-[11px] text-nexo-faint">
            {activeSnapshot.previousResults
              ? `Os rótulos dos marcadores mostram a variação desde ${formatSnapshotDate(snapshots[snapshots.findIndex((snapshot) => snapshot.id === activeSnapshot.id) + 1]?.ts ?? activeSnapshot.ts)}.`
              : 'Esta é a primeira varredura — os próximos marcadores mostrarão a variação.'}
          </p>
        </div>
        <span className="text-[10px] font-medium text-nexo-faint">centro tracejado</span>
      </div>

      <div className="mt-5 rounded-nexo-lg border border-nexo-border-strong bg-nexo-blue/10 px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="nexo-section">Comparação de varreduras</p>
            <h4 className="mt-0.5 text-sm font-medium text-nexo-text">Escolha a data exibida no mapa</h4>
            <p className="mt-0.5 text-[11px] text-nexo-dim">Mais antiga à esquerda, mais recente à direita. Só os pinos mudam.</p>
          </div>
          <span className="rounded-full bg-nexo-surface px-2 py-1 text-[10px] font-medium tabular-nums text-nexo-sky">{snapshots.length} {snapshots.length === 1 ? 'execução' : 'execuções'}</span>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Varreduras do mapa">
          {[...snapshots].reverse().map((snapshot) => {
            const active = snapshot.id === activeSnapshot.id;
            return (
              <button
                key={snapshot.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setActiveId(snapshot.id); onSelectedIdChange?.(snapshot.id); }}
                className={`min-w-[126px] border-l-2 px-3 py-1.5 text-left transition-colors ${active ? 'border-nexo-sky bg-nexo-surface text-nexo-sky' : 'border-nexo-border-strong text-nexo-dim hover:border-nexo-border-strong hover:bg-white/[0.06]'}`}
              >
                <span className="nexo-label block">{active ? 'Exibindo' : 'Varredura'}</span>
                <span className="mt-0.5 block whitespace-nowrap text-xs font-medium tabular-nums">{formatSnapshotDate(snapshot.ts)}</span>
                <span className="mt-0.5 block text-[10px] tabular-nums">{snapshot.visibility === null ? (STATUS_LABEL[snapshot.status] ?? snapshot.status) : `${snapshot.visibility}% de visibilidade`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <GridMap points={activeSnapshot.results} previousPoints={activeSnapshot.previousResults} gridSize={gridSize} target={target} captureId={captureId} />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-nexo-dim">
        <span><b className="text-nexo-ice">+3</b> posições ganhas</span><span><b className="text-nexo-danger-text">-3</b> posições perdidas</span><span><b className="text-nexo-dim">novo</b> entrou no pacote</span><span><b className="text-nexo-dim">saiu</b> deixou o pacote</span>
      </div>
    </section>
  );
}
