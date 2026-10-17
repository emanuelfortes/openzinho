import { runsPerMonth } from './cadence';

/**
 * DataForSEO Local Finder price per grid point (one task), in USD. Advisory only: the
 * provider bills what it reports, and the real cost of every run is stored with the run.
 */
export const PRICE_PER_POINT_USD = { standard: 0.0006, priority: 0.0012 } as const;

export interface CampaignEstimateInput {
  gridSize: number;
  keywordCount: number;
  frequency: string;
  queueMode: 'standard' | 'priority';
  /** Points that are never queried (sea, river, park). */
  inactivePoints?: number;
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
  const price = PRICE_PER_POINT_USD[input.queueMode];
  return {
    pointsPerRun,
    runsPerMonth: runs,
    tasksPerMonth: Math.round(pointsPerRun * runs),
    perRunUsd: pointsPerRun * price,
    perMonthUsd: pointsPerRun * runs * price,
  };
}
