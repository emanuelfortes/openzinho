// Numbers of one business for the owner's home: map position from its campaigns and reviews
// from the review monitor. Read inside the business's project scope.
import { getGridResults, getProjectDataDb, type GridPoint, type Project } from '@/lib/db';
import { getCampaignKeywordStatus, listCampaigns } from '@/modules/grade/campaigns-db';
import { listCampaignOverview } from '@/modules/grade/overview';
import { listMonitored } from '@/modules/avaliacoes/monitor-db';
import { getBilling } from '@/modules/cobranca/billing';
import { mercadoPagoConfigured } from '@/modules/cobranca/mercadopago';
import type { MapSummary, OwnerSummary, ReviewSummary } from './advice';

const DAY = 86_400_000;

export interface OwnerHomeData extends OwnerSummary {
  /** Latest finished scan of the main campaign's first keyword, for the thumbnail. */
  thumbnail: { results: GridPoint[]; gridSize: number; keyword: string } | null;
}

function reviewSummary(projectId: string, now: number): ReviewSummary | null {
  const profiles = listMonitored(projectId).filter((listing) => listing.active).length;
  if (profiles === 0) return null;
  const row = getProjectDataDb(projectId).prepare(`SELECT
      COUNT(*) AS total,
      AVG(r.rating) AS avg_rating,
      SUM(CASE WHEN r.published_at >= @since30 THEN 1 ELSE 0 END) AS last30,
      SUM(CASE WHEN r.rating >= 1 AND r.rating <= 3 AND r.owner_answered = 0 AND r.published_at >= @since90 THEN 1 ELSE 0 END) AS unanswered
    FROM av_reviews r JOIN av_monitored m ON m.id = r.monitored_id WHERE m.active = 1`)
    .get({ since30: now - 30 * DAY, since90: now - 90 * DAY }) as { total: number; avg_rating: number | null; last30: number | null; unanswered: number | null };
  return {
    profiles,
    total: row.total,
    avgRating: row.avg_rating === null ? null : Math.round(row.avg_rating * 10) / 10,
    last30Days: row.last30 ?? 0,
    unansweredNegatives: row.unanswered ?? 0,
  };
}

/** The campaign shown on the home: the active one scanned most recently. */
function mainCampaign(project: Project): MapSummary | null {
  const rows = listCampaignOverview([project]);
  if (rows.length === 0) return null;
  const pick = [...rows].sort((a, b) => Number(b.active) - Number(a.active) || (b.lastRunTs ?? 0) - (a.lastRunTs ?? 0))[0];
  return {
    campaignId: pick.campaignId, campaignName: pick.campaignName, keywordCount: pick.keywordCount,
    avgPosition: pick.avgPosition, shareOfVoice: pick.shareOfVoice,
    avgPositionDelta: pick.avgPositionDelta, shareOfVoiceDelta: pick.shareOfVoiceDelta, lastRunTs: pick.lastRunTs,
  };
}

export function ownerHomeData(project: Project, now = Date.now()): OwnerHomeData {
  const map = mainCampaign(project);
  let thumbnail: OwnerHomeData['thumbnail'] = null;
  if (map) {
    const campaign = listCampaigns().find((item) => item.id === map.campaignId);
    const firstDone = campaign ? getCampaignKeywordStatus(campaign).find((keyword) => keyword.latestDoneRunId) : undefined;
    const results = firstDone?.latestDoneRunId ? getGridResults(firstDone.latestDoneRunId) : null;
    if (campaign && firstDone && results) thumbnail = { results, gridSize: campaign.grid_size, keyword: firstDone.keyword };
  }
  const billing = mercadoPagoConfigured() ? getBilling(project.id) : null;
  return {
    campaigns: listCampaigns().length,
    map,
    reviews: reviewSummary(project.id, now),
    paymentPending: mercadoPagoConfigured() && billing?.mpStatus !== 'authorized',
    thumbnail,
  };
}
