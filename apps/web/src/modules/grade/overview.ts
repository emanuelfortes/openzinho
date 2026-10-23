// Reads every client's campaigns for the overview. Each project has its own database, so
// the data is gathered one project at a time inside that project's scope.
import { getGridResults, getProjectDataDb, getProjects, runInProjectScope, type Project } from '@/lib/db';
import { campaignSeriesId, listCampaigns, parseCenter } from './campaigns-db';
import { getInactivePoints } from './inactive-points-db';
import { computeGradeMetrics } from './metrics';
import { summarizeKeywords, type CampaignOverviewRow } from './overview-shared';

export * from './overview-shared';

/** Campaigns of the given businesses (by default all); pass the user's allowed businesses. */
export function listCampaignOverview(projects: Project[] = getProjects()): CampaignOverviewRow[] {
  const rows: CampaignOverviewRow[] = [];
  for (const project of projects) {
    runInProjectScope(project.id, () => {
      const lastRuns = getProjectDataDb().prepare(`SELECT id, ts FROM grid_searches WHERE series_id = ? AND status = 'done' ORDER BY ts DESC LIMIT 2`);
      for (const campaign of listCampaigns()) {
        const inactive = getInactivePoints(campaign);
        let lastRunTs: number | null = null;
        const keywords = campaign.keywords.map((keyword) => {
          const [current, previous] = lastRuns.all(campaignSeriesId(campaign, keyword)) as Array<{ id: string; ts: number }>;
          if (current && (lastRunTs === null || current.ts > lastRunTs)) lastRunTs = current.ts;
          const metrics = (run?: { id: string }) => {
            const results = run ? getGridResults(run.id) : null;
            return results ? computeGradeMetrics(results, inactive) : null;
          };
          return { current: metrics(current), previous: metrics(previous) };
        });
        rows.push({
          projectId: project.id,
          projectName: project.name,
          campaignId: campaign.id,
          campaignName: campaign.name,
          target: campaign.target,
          tags: campaign.tags ?? [],
          owner: campaign.owner ?? '',
          active: campaign.active,
          center: parseCenter(campaign.center),
          keywordCount: campaign.keywords.length,
          lastRunTs,
          ...summarizeKeywords(keywords),
        });
      }
    });
  }
  return rows;
}
