import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { getGridResults, getSetting } from '@/lib/db';
import { getGridPreferences } from '@/lib/grid-preferences-server';
import { formatDistance } from '@/lib/grid-preferences';
import CampaignForm from '@/modules/grade/CampaignForm';
import DeleteCampaignButton from '@/modules/grade/DeleteCampaignButton';
import { getCampaign, getCampaignKeywordStatus, getCampaignSpend, listCampaigns, type GridCampaign } from '@/modules/grade/campaigns-db';
import { estimateCampaign } from '@/modules/grade/estimate';
import { computeGradeMetrics } from '@/modules/grade/metrics';
import { runCampaignNowAction } from './actions';

interface SearchParams {
  edit?: string;
  new?: string;
  queued?: string;
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeSchedule(campaign: GridCampaign): string {
  const at = `at ${campaign.time_of_day}`;
  switch (campaign.frequency) {
    case 'daily': return `Every day ${at}`;
    case 'weekly': return `Every ${weekdays[campaign.weekday ?? 1]} ${at}`;
    case 'biweekly': return `Every other ${weekdays[campaign.weekday ?? 1]} ${at}`;
    case 'monthly': return `Monthly on day ${campaign.month_day ?? 1} ${at}`;
  }
}

function formatWhen(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(ts));
}

function monthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function CampaignCard({ campaign, queued, distanceUnit }: { campaign: GridCampaign; queued: boolean; distanceUnit: ReturnType<typeof getGridPreferences>['distanceUnit'] }) {
  const keywords = getCampaignKeywordStatus(campaign);
  const nextRuns = keywords.map((keyword) => keyword.next_run_at).filter((value): value is number => value !== null);
  const nextRun = nextRuns.length > 0 ? Math.min(...nextRuns) : null;
  const estimate = estimateCampaign({ gridSize: campaign.grid_size, keywordCount: campaign.keywords.length, frequency: campaign.frequency, queueMode: campaign.queue_mode });
  const spent = getCampaignSpend(campaign, monthStart());

  return (
    <section id={`campaign-${campaign.id}`} className="scroll-mt-6 rounded-nexo-lg border border-nexo-border bg-nexo-surface p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-medium text-nexo-text">{campaign.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${campaign.active ? 'bg-nexo-ice/10 text-nexo-ice' : 'bg-nexo-surface-2 text-nexo-dim'}`}>
              {campaign.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-nexo-dim">
            {campaign.target} · {campaign.grid_size}×{campaign.grid_size} · {formatDistance(campaign.spacing_km, distanceUnit)} spacing · {campaign.queue_mode} queue
          </p>
          <p className="mt-0.5 text-xs text-nexo-dim">
            {describeSchedule(campaign)} ({campaign.time_zone.replace(/_/g, ' ')})
            {campaign.active && nextRun !== null && <> · next {formatWhen(nextRun, campaign.time_zone)}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {campaign.active && (
            <form action={runCampaignNowAction}>
              <input type="hidden" name="id" value={campaign.id} />
              <button type="submit" className="nexo-section rounded-nexo-lg border border-nexo-border-strong bg-nexo-surface px-3 py-2 transition-colors hover:bg-nexo-blue/15">
                Run now
              </button>
            </form>
          )}
          <Link href={`/dashboard/campaigns?edit=${campaign.id}`} className="nexo-section hover:text-white">Edit</Link>
          <DeleteCampaignButton id={campaign.id} />
        </div>
      </div>

      {queued && (
        <p className="mt-3 rounded-nexo-lg bg-nexo-blue/10 px-3 py-2 text-[11px] font-semibold text-nexo-sky">
          Queued. The worker posts every keyword on its next pass (about a minute) and the results arrive as DataForSEO finishes them.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="nexo-label border-b border-nexo-border">
              <th className="py-2 pr-3">Keyword</th>
              <th className="py-2 pr-3 text-right">Avg position</th>
              <th className="py-2 pr-3 text-right">Share of Voice</th>
              <th className="py-2 pr-3 text-right">Top 3</th>
              <th className="py-2">Last run</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((keyword) => {
              const results = keyword.latestDoneRunId ? getGridResults(keyword.latestDoneRunId) : null;
              const metrics = results ? computeGradeMetrics(results) : null;
              return (
                <tr key={keyword.series_id} className="border-b border-nexo-border last:border-0">
                  <td className="py-2 pr-3 font-medium text-nexo-text">
                    {keyword.latestDoneRunId
                      ? <Link href={`/dashboard/geo-grid?grid_history_id=${keyword.latestDoneRunId}#results`} className="hover:text-nexo-sky">{keyword.keyword}</Link>
                      : keyword.keyword}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums text-nexo-text">{metrics?.avgPosition ?? '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-nexo-dim">{metrics ? `${metrics.shareOfVoice}%` : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-nexo-dim">{metrics ? `${metrics.bands.top3}%` : '—'}</td>
                  <td className="py-2 text-nexo-dim">
                    {keyword.latestRun
                      ? <>{formatWhen(keyword.latestRun.ts, campaign.time_zone)}{keyword.latestRun.status === 'pending' && <span className="ml-1 font-medium text-nexo-warn-text">· running</span>}</>
                      : 'Not run yet'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-nexo-faint">
        Spent this month: <b className="tabular-nums text-nexo-dim">${spent.toFixed(3)}</b> · estimate ${estimate.perMonthUsd.toFixed(2)}/month
      </p>
    </section>
  );
}

async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const campaigns = listCampaigns();
  const editing = params.edit ? getCampaign(params.edit) : null;
  const showForm = Boolean(editing) || params.new === '1' || campaigns.length === 0;
  const { distanceUnit } = getGridPreferences();
  const defaults = {
    center: getSetting('default_coordinates') ?? '',
    language: getSetting('default_language') ?? 'English',
    target: getSetting('default_domain') ?? '',
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 grid h-9 w-9 place-items-center rounded-nexo-lg bg-nexo-blue/10 text-nexo-sky">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div>
            <h1 className="nexo-h1">Grid campaigns</h1>
            <p className="mt-1 max-w-2xl text-sm text-nexo-dim">
              Track several keywords for one business on the same grid and schedule. Each keyword keeps its own Geo-grid timeline.
            </p>
          </div>
        </div>
        {!showForm && (
          <Link href="/dashboard/campaigns?new=1" className="rounded-nexo-lg bg-nexo-blue px-4 py-2.5 text-xs font-medium uppercase tracking-widest text-white hover:bg-nexo-sky">
            New campaign
          </Link>
        )}
      </div>

      {showForm && (
        <section className="rounded-nexo-lg border border-nexo-border bg-nexo-surface p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-medium text-nexo-text">{editing ? `Edit “${editing.name}”` : 'New campaign'}</h2>
          <CampaignForm key={editing?.id ?? 'new'} campaign={editing} defaults={defaults} distanceUnit={distanceUnit} />
        </section>
      )}

      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} queued={params.queued === campaign.id} distanceUnit={distanceUnit} />
      ))}

      <p className="text-[11px] text-nexo-faint">Scheduled runs are posted by the Geo-grid worker, which <code>npm run dev</code> and <code>npm start</code> launch alongside the app.</p>
    </div>
  );
}

export default withProjectScope(CampaignsPage);
