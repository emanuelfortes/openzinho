import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getGridPreferences } from '@/lib/grid-preferences-server';
import { formatDistance } from '@/lib/grid-preferences';
import GridPointSelector from '@/modules/grade/GridPointSelector';
import { getInactivePoints } from '@/modules/grade/inactive-points-db';
import { parseCenter } from '@/modules/grade/campaigns-shared';

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
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-32 sm:p-8 sm:pb-32">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Grid points</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Turn off points that fall on the sea, a river or a park. They are skipped on every keyword scanned on this grid, and left out of the metrics.
          </p>
        </div>
        <Link href={back} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          ← Done
        </Link>
      </div>

      {valid ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {gridSize}×{gridSize} grid · {formatDistance(spacingKm, distanceUnit)} spacing · center {params.center}
          </p>
          <GridPointSelector
            center={params.center!}
            gridSize={gridSize}
            spacingKm={spacingKm}
            inactive={[...getInactivePoints({ center: params.center!, grid_size: gridSize, spacing_km: spacingKm })]}
          />
        </section>
      ) : (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">This grid link is incomplete. Open it again from a monitor or a campaign.</p>
      )}
    </div>
  );
}

export default withProjectScope(GridPointsPage);
