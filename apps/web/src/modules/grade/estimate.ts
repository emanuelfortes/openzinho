import { runsPerMonth } from './cadence';
import { normalizeGridDepth } from './grid-config';

/**
 * DataForSEO Local Finder price per grid point (one task), in USD. Advisory only: the
 * provider bills what it reports, and the real cost of every run is stored with the run.
 */
export const PRICE_PER_POINT_USD = { standard: 0.0006, priority: 0.0012 } as const;

/**
 * Price multiplier by depth (20 to 100). Empty on purpose: the estimate is flat per task, so every
 * depth costs the table price above. If DataForSEO bills deeper results differently, add the
 * factors here (e.g. { 100: 2 }) and every estimate in the app follows.
 */
const DEPTH_PRICE_FACTOR: Readonly<Record<number, number>> = {};

/**
 * Estimated price of one Local Finder task at the given depth. The single place where depth can
 * change the estimate. Advisory only; each run records the cost DataForSEO reports.
 */
export function pricePerTaskUsd(queueMode: 'standard' | 'priority', depth?: number): number {
  return PRICE_PER_POINT_USD[queueMode] * (DEPTH_PRICE_FACTOR[normalizeGridDepth(depth)] ?? 1);
}

export interface CampaignEstimateInput {
  gridSize: number;
  keywordCount: number;
  frequency: string;
  queueMode: 'standard' | 'priority';
  /** Points that are never queried (sea, river, park). */
  inactivePoints?: number;
  /** Local results checked per point, 20 to 100. Defaults to 20. */
  depth?: number;
}

export interface CampaignEstimate {
  pointsPerRun: number;
  runsPerMonth: number;
  tasksPerMonth: number;
  perRunUsd: number;
  perMonthUsd: number;
}

export function estimateCampaign(input: CampaignEstimateInput): CampaignEstimate {
  const pointsPerRun = Math.max(input.gridSize * input.gridSize - (input.inactivePoints ?? 0), 0) * input.keywordCount;
  const runs = runsPerMonth(input.frequency);
  const price = pricePerTaskUsd(input.queueMode, input.depth);
  return {
    pointsPerRun,
    runsPerMonth: runs,
    tasksPerMonth: Math.round(pointsPerRun * runs),
    perRunUsd: pointsPerRun * price,
    perMonthUsd: pointsPerRun * runs * price,
  };
}
