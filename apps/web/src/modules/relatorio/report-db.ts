// Reads a campaign's scans for a month and its previous month and builds the report.
// Runs inside the caller's project scope (page, public link or job).
import { getGridResults, getProjectDataDb } from '@/lib/db';
import { campaignSeriesId, type GridCampaign } from '@/modules/grade/campaigns-db';
import { getInactivePoints } from '@/modules/grade/inactive-points-db';
import { analyzeKeyword, summarizeCampaign, type CampaignReport, type ScanInput } from './analysis';
import { monthLabel, monthRange, shiftMonth } from './months';

/** Latest finished scan of the series inside [start, end), or null. */
function latestDoneScan(seriesId: string, range: { start: number; end: number }): ScanInput | null {
  const row = getProjectDataDb()
    .prepare(`SELECT id, ts FROM grid_searches WHERE series_id = ? AND status = 'done' AND ts >= ? AND ts < ? ORDER BY ts DESC LIMIT 1`)
    .get(seriesId, range.start, range.end) as { id: string; ts: number } | undefined;
  if (!row) return null;
  const results = getGridResults(row.id);
  return results ? { ts: row.ts, results } : null;
}

export function buildCampaignReport(campaign: GridCampaign, month: string, now = Date.now()): CampaignReport {
  const previousMonth = shiftMonth(month, -1);
  const zone = campaign.time_zone || 'UTC';
  const currentRange = monthRange(month, zone);
  const previousRange = monthRange(previousMonth, zone);
  const inactive = getInactivePoints(campaign);
  const labels = { monthLabel: monthLabel(month), previousMonthLabel: monthLabel(previousMonth) };

  const keywords = campaign.keywords.map((keyword) => {
    const seriesId = campaignSeriesId(campaign, keyword);
    return analyzeKeyword({
      keyword,
      gridSize: campaign.grid_size,
      spacingKm: campaign.spacing_km,
      inactive,
      current: latestDoneScan(seriesId, currentRange),
      previous: latestDoneScan(seriesId, previousRange),
      ...labels,
    });
  });

  return {
    campaignName: campaign.name,
    target: campaign.target,
    gridSize: campaign.grid_size,
    spacingKm: campaign.spacing_km,
    month,
    previousMonth,
    ...labels,
    generatedAt: now,
    keywords,
    summary: summarizeCampaign(keywords),
  };
}
