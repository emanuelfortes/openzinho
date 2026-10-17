import type { GridPoint } from '@/lib/db';

/** Rank counted for a point where the target is missing from the top 20. */
export const NOT_FOUND_RANK = 21;

/**
 * Share of Voice weight per position. Higher positions weigh much more because
 * the first three results take most of the clicks in the local pack.
 */
export function sovWeight(rank: number | null): number {
  if (rank === null || rank < 1) return 0;
  if (rank === 1) return 1;
  if (rank === 2) return 0.6;
  if (rank === 3) return 0.4;
  if (rank <= 10) return 0.1;
  if (rank <= 20) return 0.02;
  return 0;
}

export type RankBand = 'top3' | 'top10' | 'top20' | 'out';

export function rankBand(rank: number | null): RankBand {
  if (rank === null || rank < 1 || rank > 20) return 'out';
  if (rank <= 3) return 'top3';
  if (rank <= 10) return 'top10';
  return 'top20';
}

export const BAND_ORDER: RankBand[] = ['top3', 'top10', 'top20', 'out'];

/** Stable key of a grid cell, also used to mark points as inactive. */
export function pointKey(point: Pick<GridPoint, 'row' | 'col'>): string {
  return `${point.row}:${point.col}`;
}

export interface GradeMetrics {
  activePoints: number;
  /** Mean position across active points, counting 21 where the target is not in the top 20. */
  avgPosition: number | null;
  /** Weighted visibility, 0-100. */
  shareOfVoice: number;
  /** Share of active points in each band, 0-100, rounded to one decimal. */
  bands: Record<RankBand, number>;
  bandCounts: Record<RankBand, number>;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function computeGradeMetrics(results: GridPoint[], inactive: ReadonlySet<string> = new Set()): GradeMetrics {
  const active = results.filter((point) => !inactive.has(pointKey(point)));
  const bandCounts: Record<RankBand, number> = { top3: 0, top10: 0, top20: 0, out: 0 };
  let positionSum = 0;
  let weightSum = 0;

  for (const point of active) {
    bandCounts[rankBand(point.rank)] += 1;
    positionSum += point.rank === null || point.rank < 1 ? NOT_FOUND_RANK : Math.min(point.rank, NOT_FOUND_RANK);
    weightSum += sovWeight(point.rank);
  }

  const total = active.length;
  const share = (count: number) => (total > 0 ? round1((count / total) * 100) : 0);
  return {
    activePoints: total,
    avgPosition: total > 0 ? round1(positionSum / total) : null,
    shareOfVoice: total > 0 ? round1((weightSum / total) * 100) : 0,
    bands: { top3: share(bandCounts.top3), top10: share(bandCounts.top10), top20: share(bandCounts.top20), out: share(bandCounts.out) },
    bandCounts,
  };
}

export interface GradeMetricsDelta {
  /** Negative means the business moved up (better). */
  avgPosition: number | null;
  /** Percentage points. */
  shareOfVoice: number;
  /** Percentage points per band. */
  bands: Record<RankBand, number>;
}

export function compareGradeMetrics(current: GradeMetrics, previous: GradeMetrics | null): GradeMetricsDelta | null {
  if (!previous || previous.activePoints === 0 || current.activePoints === 0) return null;
  return {
    avgPosition: current.avgPosition !== null && previous.avgPosition !== null
      ? round1(current.avgPosition - previous.avgPosition)
      : null,
    shareOfVoice: round1(current.shareOfVoice - previous.shareOfVoice),
    bands: {
      top3: round1(current.bands.top3 - previous.bands.top3),
      top10: round1(current.bands.top10 - previous.bands.top10),
      top20: round1(current.bands.top20 - previous.bands.top20),
      out: round1(current.bands.out - previous.bands.out),
    },
  };
}
