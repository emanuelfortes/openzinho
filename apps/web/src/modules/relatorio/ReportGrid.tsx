import { RANK_TIERS, rankTier } from '@/lib/rank-scale';
import type { ReportPoint } from './analysis';

// Swatches are opaque, so the faint "not found" text of the live map is replaced by a readable one.
const TEXT = { top: '#030508', mid: '#ffffff', low: '#ffffff', none: 'rgba(194,224,255,.6)' } as const;

/**
 * Static grid of one scan in the rank scale (no basemap). Inactive or missing cells stay empty,
 * the dashed square is the center. North is up.
 */
export default function ReportGrid({ points, gridSize, size = 220, label }: { points: ReportPoint[] | null; gridSize: number; size?: number; label: string }) {
  const cell = size / gridSize;
  const middle = Math.floor(gridSize / 2);
  const byKey = new Map((points ?? []).map((point) => [`${point.row}:${point.col}`, point]));
  const cells = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const point = byKey.get(`${row}:${col}`);
      const x = col * cell;
      const y = row * cell;
      if (!point) {
        cells.push(<rect key={`${row}:${col}`} x={x + 1} y={y + 1} width={cell - 2} height={cell - 2} rx={3} fill="none" stroke="rgba(77,162,255,.12)" />);
        continue;
      }
      const tierName = rankTier(point.rank);
      const tier = RANK_TIERS[tierName];
      cells.push(
        <g key={`${row}:${col}`}>
          <rect x={x + 1} y={y + 1} width={cell - 2} height={cell - 2} rx={3} fill={tier.swatch} />
          {cell >= 18 && (
            <text x={x + cell / 2} y={y + cell / 2} dominantBaseline="central" textAnchor="middle" fontSize={Math.min(12, cell * 0.38)} fontFamily="var(--font-geist-mono)" fill={TEXT[tierName]}>
              {point.rank == null ? '-' : point.rank}
            </text>
          )}
        </g>,
      );
    }
  }
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="max-w-[260px] rounded-nexo bg-nexo-surface-2">
      {points ? cells : null}
      {points && (
        <rect x={middle * cell + 2.5} y={middle * cell + 2.5} width={cell - 5} height={cell - 5} rx={2} fill="none" stroke="#eaf2ff" strokeDasharray="3 2" strokeWidth={1} />
      )}
      {!points && (
        <text x={size / 2} y={size / 2} dominantBaseline="central" textAnchor="middle" fontSize={12} fill="rgba(234,242,255,.45)">Sem varredura</text>
      )}
    </svg>
  );
}
