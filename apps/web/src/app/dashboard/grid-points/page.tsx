import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getGridPreferences } from '@/lib/grid-preferences-server';
import { formatDistance } from '@/lib/grid-preferences';
import GridPointSelector from '@/modules/grade/GridPointSelector';
import { getInactivePoints } from '@/modules/grade/inactive-points-db';
import { parseCenter } from '@/modules/grade/campaigns-shared';
import { getBudgetSettings } from '@/modules/custos/budget';

interface SearchParams {
  center?: string;
  grid_size?: string;
  spacing_km?: string;
  back?: string;
}

/** Only link back to pages inside the dashboard. */
function safeBack(value: string | undefined): string {
  return value && value.startsWith('/dashboard/') && !value.startsWith('//') ? value : '/dashboard/geo-grid';
}

async function GridPointsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const center = parseCenter(params.center ?? '');
  const gridSize = Number(params.grid_size);
  const spacingKm = Number(params.spacing_km);
  const back = safeBack(params.back);
  const valid = center && [3, 5, 7, 9, 11].includes(gridSize) && spacingKm > 0;
  const { distanceUnit } = getGridPreferences();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="nexo-h1">Pontos da grade</h1>
          <p className="mt-2 max-w-2xl text-sm text-nexo-dim">
            Desligue os pontos que caem no mar, num rio ou num parque. Eles deixam de ser consultados em todas as palavras-chave desta grade e saem das métricas.
          </p>
        </div>
        <Link href={back} className="nexo-btn-ghost px-3 py-2">← Voltar</Link>
      </div>

      {valid ? (
        <section className="nexo-panel p-4 sm:p-5">
          <p className="mb-3 text-xs text-nexo-dim">
            Grade {gridSize}×{gridSize} · espaçamento de {formatDistance(spacingKm, distanceUnit)} · centro <span className="font-mono">{params.center}</span>
          </p>
          <GridPointSelector
            center={params.center!}
            gridSize={gridSize}
            spacingKm={spacingKm}
            inactive={[...getInactivePoints({ center: params.center!, grid_size: gridSize, spacing_km: spacingKm })]}
            brlPerUsd={getBudgetSettings().brlPerUsd}
          />
        </section>
      ) : (
        <p className="rounded-nexo-lg border border-nexo-danger/40 bg-nexo-danger/10 px-4 py-3 text-sm text-nexo-danger-text">
          Este link de grade está incompleto. Abra de novo a partir de um monitor ou de uma campanha.
        </p>
      )}
    </div>
  );
}

export default withProjectScope(GridPointsPage);
