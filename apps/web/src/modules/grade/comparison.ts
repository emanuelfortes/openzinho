import type { GridPoint } from '@/lib/db';
import { competitorKey } from '@/app/dashboard/local-finder/grid-insights';
import { computeGradeMetrics, type GradeMetrics } from './metrics';

export interface ComparedBusiness {
  key: string;
  name: string;
  isTarget: boolean;
  /** The grid as seen for this business: rank = its position at each point. */
  points: GridPoint[];
  metrics: GradeMetrics;
}

/** Re-reads the same scan from a competitor's point of view; no extra API call needed. */
export function competitorPoints(results: GridPoint[], key: string): GridPoint[] {
  return results.map((point) => {
    const match = (point.items ?? []).find((item) => !item.is_target && competitorKey(item) === key);
    return { ...point, rank: match ? match.rank_group : null };
  });
}

/** The client plus up to `limit` competitors, ordered by how much of the grid they hold. */
export function compareWithCompetitors(
  results: GridPoint[], target: string, competitors: Array<{ key: string; name: string }>, limit = 3,
): ComparedBusiness[] {
  const client: ComparedBusiness = { key: 'target', name: target, isTarget: true, points: results, metrics: computeGradeMetrics(results) };
  const rivals = competitors.map((competitor) => {
    const points = competitorPoints(results, competitor.key);
    return { key: competitor.key, name: competitor.name, isTarget: false, points, metrics: computeGradeMetrics(points) };
  });
  rivals.sort((a, b) => b.metrics.shareOfVoice - a.metrics.shareOfVoice);
  return [client, ...rivals.slice(0, limit)];
}
