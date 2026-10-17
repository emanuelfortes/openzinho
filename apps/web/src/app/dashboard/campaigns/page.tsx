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
import { getInactivePoints, gridPointsHref } from '@/modules/grade/inactive-points-db';
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
  const inactive = getInactivePoints(campaign);
  const estimate = estimateCampaign({
    gridSize: campaign.grid_size, keywordCount: campaign.keywords.length, frequency: campaign.frequency,
    queueMode: campaign.queue_mode, inactivePoints: inactive.size,
  });
  const spent = getCampaignSpend(campaign, monthStart());

  return (
    <section id={`campaign-${campaign.id}`} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-black text-slate-900 dark:text-white">{campaign.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${campaign.active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
              {campaign.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {campaign.target} · {campaign.grid_size}×{campaign.grid_size} · {formatDistance(campaign.spacing_km, distanceUnit)} spacing · {campaign.queue_mode} queue
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {describeSchedule(campaign)} ({campaign.time_zone.replace(/_/g, ' ')})
            {campaign.active && nextRun !== null && <> · next {formatWhen(nextRun, campaign.time_zone)}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {campaign.active && (
            <form action={runCampaignNowAction}>
              <input type="hidden" name="id" value={campaign.id} />
              <button type="submit" className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300">
                Run now
              </button>
            </form>
          )}
          <Link href={gridPointsHref(campaign, `/dashboard/campaigns#campaign-${campaign.id}`)} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 dark:text-blue-400">
            Points{inactive.size > 0 ? ` · ${inactive.size} off` : ''}
          </Link>
          <Link href={`/dashboard/campaigns?edit=${campaign.id}`} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 dark:text-blue-400">Edit</Link>
          <DeleteCampaignButton id={campaign.id} />
        </div>
      </div>

      {queued && (
        <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          Queued. The worker posts every keyword on its next pass (about a minute) and the results arrive as DataForSEO finishes them.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
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
              const metrics = results ? computeGradeMetrics(results, inactive) : null;
              return (
                <tr key={keyword.series_id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="py-2 pr-3 font-bold text-slate-800 dark:text-slate-100">
                    {keyword.latestDoneRunId
                      ? <Link href={`/dashboard/geo-grid?grid_history_id=${keyword.latestDoneRunId}#results`} className="hover:text-blue-600">{keyword.keyword}</Link>
                      : keyword.keyword}
                  </td>
                  <td className="py-2 pr-3 text-right font-black tabular-nums text-slate-900 dark:text-white">{metrics?.avgPosition ?? '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{metrics ? `${metrics.shareOfVoice}%` : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{metrics ? `${metrics.bands.top3}%` : '—'}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">
                    {keyword.latestRun
                      ? <>{formatWhen(keyword.latestRun.ts, campaign.time_zone)}{keyword.latestRun.status === 'pending' && <span className="ml-1 font-bold text-amber-600">· running</span>}</>
                      : 'Not run yet'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        Spent this month: <b className="tabular-nums text-slate-600 dark:text-slate-300">${spent.toFixed(3)}</b> · estimate ${estimate.perMonthUsd.toFixed(2)}/month
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
          <span className="mt-1 grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Grid campaigns</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Track several keywords for one business on the same grid and schedule. Each keyword keeps its own Geo-grid timeline.
            </p>
          </div>
        </div>
        {!showForm && (
          <Link href="/dashboard/campaigns?new=1" className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700">
            New campaign
          </Link>
        )}
      </div>

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <h2 className="mb-4 text-sm font-black text-slate-900 dark:text-white">{editing ? `Edit “${editing.name}”` : 'New campaign'}</h2>
          <CampaignForm key={editing?.id ?? 'new'} campaign={editing} defaults={defaults} distanceUnit={distanceUnit} inactivePoints={editing ? [...getInactivePoints(editing)] : []} />
        </section>
      )}

      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} queued={params.queued === campaign.id} distanceUnit={distanceUnit} />
      ))}

      <p className="text-[11px] text-slate-400">Scheduled runs are posted by the Geo-grid worker, which <code>npm run dev</code> and <code>npm start</code> launch alongside the app.</p>
    </div>
  );
}

export default withProjectScope(CampaignsPage);
