import type { GridPoint } from '@/lib/db';
import { rankTier, RANK_TIERS } from '@/lib/rank-scale';

/**
 * Tiny heat grid of one scan in the blue rank scale, for the timeline. Points that were not
 * scanned (inactive) are left empty, so the shape of the grid stays recognisable.
 */
export default function GridThumbnail({ results, gridSize, size = 56 }: { results: GridPoint[]; gridSize: number; size?: number }) {
  const cell = size / gridSize;
  const byKey = new Map(results.map((point) => [`${point.row}:${point.col}`, point]));
  const cells = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const point = byKey.get(`${row}:${col}`);
      if (!point) continue;
      cells.push(
        <rect
          key={`${row}:${col}`}
          x={col * cell + 0.5} y={row * cell + 0.5} width={cell - 1} height={cell - 1} rx={Math.min(1.5, cell / 4)}
          fill={RANK_TIERS[rankTier(point.rank)].swatch}
        />,
      );
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0 rounded-[3px] bg-nexo-surface-2">
      {cells}
    </svg>
  );
}
