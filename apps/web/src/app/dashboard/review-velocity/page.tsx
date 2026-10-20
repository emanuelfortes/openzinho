import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ChevronDown, Clock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getCredentials, getCurrentProject, getSetting } from '@/lib/db';
import { getBrandSettings } from '@/lib/brand-server';
import { buildComparisonReport, CRITERIA, formatCriterion, rgbCss, seriesColors, type ComparisonReport } from '@/lib/review-report';
import { comparisonReportMetrics, comparisonReportSections } from '@/lib/review-report-pdf';
import { getBenchmark, getBenchmarkListings, getReviewsByListing, getTasks, listBenchmarks, type Benchmark } from '@/lib/review-velocity-db';
import { collectReviewTasks } from '@/lib/review-velocity-tasks';
import AutoRefresh from '@/components/AutoRefresh';
import ExportExcelButton from '@/components/ExportExcelButton';
import HistorySidebar from '@/components/HistorySidebar';
import PendingButton from '@/components/PendingButton';
import ReportPdfExportButton from '@/components/ReportPdfExportButton';
import BenchmarkBuilder from './BenchmarkBuilder';
import { deleteBenchmarkAction, refreshBenchmarkAction } from './actions';
import { DataView, formatDay, OverviewView, ReportView } from './views';

interface SearchParams { id?: string; tab?: string }
type Tab = 'overview' | 'report' | 'data';

function areaLabel(benchmark: Benchmark): string {
  const [lat, lng] = benchmark.center.split(',').map(Number);
  const where = benchmark.areaLabel || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return `${benchmark.radiusKm} km around ${where}`;
}

function fileStem(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'review-velocity';
}

function excelSheets(report: ComparisonReport) {
  const completeWeeks = report.weeks.slice(0, -1);
  return [
    {
      name: 'Ranking',
      columns: [
        { key: 'rank', label: 'Overall rank' }, { key: 'listing', label: 'Listing' }, { key: 'score', label: 'Score' },
        ...CRITERIA.flatMap((c) => [{ key: c.id, label: c.label }, { key: `${c.id}_rank`, label: `${c.short} rank` }]),
      ],
      data: report.listings.map((l) => ({
        rank: l.overallRank ?? '', listing: l.isSelf ? `${l.title} (you)` : l.title, score: l.score !== null ? Math.round(l.score) : '',
        ...Object.fromEntries(CRITERIA.flatMap((c) => [[c.id, formatCriterion(c.id, l.metrics[c.id])], [`${c.id}_rank`, l.ranks[c.id] ?? '']])),
      })),
    },
    {
      name: 'Weekly',
      columns: [{ key: 'week', label: 'Week starting' }, ...report.listings.map((l) => ({ key: String(l.id), label: l.title }))],
      data: completeWeeks.map((w, i) => ({ week: w.key, ...Object.fromEntries(report.listings.map((l) => [String(l.id), l.weekly[i] ?? 'not covered'])) })),
    },
    {
      name: 'Monthly',
      columns: [{ key: 'month', label: 'Month' }, ...report.listings.map((l) => ({ key: String(l.id), label: l.title }))],
      data: report.months.slice(0, -1).map((m, i) => ({ month: m.key, ...Object.fromEntries(report.listings.map((l) => [String(l.id), l.monthly[i] ?? 'not covered'])) })),
    },
  ];
}

async function ReviewVelocityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const projectId = getCurrentProject().id;
  const params = await searchParams;
  const credentials = getCredentials();
  const active = params.id ? getBenchmark(params.id) : null;

  // Collect finished DataForSEO tasks on every load (and relaunch the ones that do not cover 3 months).
  if (active && credentials) {
    try { await collectReviewTasks(projectId, credentials, active.id); } catch { /* shown as still pending */ }
  }

  const benchmarks = listBenchmarks();
  const historyItems = benchmarks.map((b) => (
    <Link key={b.id} href={`/dashboard/review-velocity?id=${b.id}`}
      className={`block px-5 py-3.5 transition-colors ${b.id === active?.id ? 'bg-nexo-blue/10' : 'hover:bg-white/[0.04]'}`}>
      <p className={`text-sm font-semibold truncate ${b.id === active?.id ? 'text-nexo-sky' : 'text-nexo-text'}`}>{b.name}</p>
      <p className="text-[11px] text-nexo-faint mt-0.5">
        {b.listingCount} listings · {b.radiusKm} km · {b.lastFetchAt ? `updated ${formatDay(b.lastFetchAt)}` : 'not fetched yet'}
        {b.pendingTasks > 0 && <span className="text-nexo-warn-text"> · {b.pendingTasks} pending</span>}
      </p>
    </Link>
  ));

  const header = (
    <div>
      <h1 className="nexo-h1">Review Velocity</h1>
      <p className="text-sm text-nexo-faint mt-1">Compare how fast you and your local competitors gain Google reviews, and how well each one handles them.</p>
    </div>
  );

  if (!active) {
    return (
      <div className="space-y-6">
        {header}
        {params.id && <p className="text-sm text-nexo-warn-text">This analysis no longer exists.</p>}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0">
            <BenchmarkBuilder
              defaultCenter={getSetting('default_coordinates') ?? ''}
              defaultLanguage={getSetting('default_language') ?? 'English'}
              hasCredentials={Boolean(credentials)}
            />
          </div>
          {historyItems.length > 0 && <HistorySidebar title="Analyses" items={historyItems} />}
        </div>
      </div>
    );
  }

  const tab: Tab = params.tab === 'report' || params.tab === 'data' ? params.tab : 'overview';
  const listings = getBenchmarkListings(active.id);
  const tasks = getTasks(active.id);
  const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'posting').length;
  const fetched = listings.filter((l) => l.lastFetchAt !== null).length;
  const reviews = getReviewsByListing(listings.map((l) => l.id), null);
  const report = fetched > 0 ? buildComparisonReport({
    now: Date.now(),
    timeZone: active.timeZone,
    listings: listings.map((l) => ({
      id: l.id, title: l.title, address: l.address, isSelf: l.isSelf, coverage: l.coverage,
      googleRating: l.rating, googleTotal: l.totalReviews, mapsRank: l.mapsRank,
      reviews: reviews.get(l.id) ?? [],
    })),
  }) : null;
  const colors = report ? seriesColors(report.listings) : new Map();
  const series = report?.listings.map((l) => ({
    id: l.id, title: l.title, isSelf: l.isSelf, color: rgbCss(colors.get(l.id)), weekly: l.weekly.slice(0, -1), monthly: l.monthly.slice(0, -1),
  })) ?? [];
  const context = { keyword: active.keyword, area: areaLabel(active) };
  const brand = getBrandSettings();
  const failed = tasks.filter((t) => t.status === 'error').slice(0, 3);
  const tabHref = (t: Tab) => `/dashboard/review-velocity?id=${active.id}${t === 'overview' ? '' : `&tab=${t}`}`;

  return (
    <div className="space-y-6">
      {header}
      {/* Benchmark header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-nexo-text">{active.name}</h2>
          <p className="text-[11px] text-nexo-faint mt-0.5">
            “{active.keyword}” · {context.area} · {listings.length} listings · {active.language}
            {fetched > 0 && ` · updated ${formatDay(Math.max(...listings.map((l) => l.lastFetchAt ?? 0)), active.timeZone)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <ReportPdfExportButton
              variant="solid" label="Export PDF" orientation="landscape" kicker="Competitive review report" locale="en-GB"
              brandName={brand.name} brandLogoUrl={brand.logo ?? undefined} brandColor={brand.color} brandFooter={brand.footer} brandStyle={brand}
              filename={`${fileStem(active.name)}-review-benchmark.pdf`}
              title="Review benchmark" subject={`${active.name} · ${active.keyword}`} generatedAt={report.generatedAt}
              metrics={comparisonReportMetrics(report)} sections={comparisonReportSections(report, context)}
            />
          )}
          <form action={refreshBenchmarkAction}>
            <input type="hidden" name="id" value={active.id} />
            <PendingButton type="submit" disabled={!credentials || pending > 0}
              title={pending > 0 ? 'Wait for the running fetches to finish' : 'Fetch the reviews published since the last update'}
              className="nexo-label inline-flex items-center gap-1.5 border border-nexo-border px-3.5 py-2 rounded-nexo-lg hover:border-nexo-border-strong transition-colors disabled:opacity-40"
              pendingChildren="Refreshing…"
              pendingClassName="nexo-label inline-flex items-center gap-1.5 border border-nexo-border px-3.5 py-2 rounded-nexo-lg">
              <RefreshCw className="w-3 h-3" /> Refresh now
            </PendingButton>
          </form>
          <details className="relative">
            <summary className="nexo-label list-none cursor-pointer inline-flex items-center gap-1.5 border border-nexo-border px-3.5 py-2 rounded-nexo-lg hover:border-nexo-border-strong [&::-webkit-details-marker]:hidden">
              Analyses <ChevronDown className="w-3 h-3" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-80 bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden divide-y divide-nexo-border">
              <Link href="/dashboard/review-velocity" className="nexo-section flex items-center gap-2 px-5 py-3 hover:bg-nexo-blue/15">
                <Plus className="w-3.5 h-3.5" /> New analysis
              </Link>
              <div className="max-h-80 overflow-y-auto divide-y divide-nexo-border">{historyItems}</div>
            </div>
          </details>
          <form action={deleteBenchmarkAction}>
            <input type="hidden" name="id" value={active.id} />
            <button type="submit" title="Delete this analysis" aria-label="Delete this analysis" className="p-2 rounded-nexo-lg text-nexo-faint hover:text-nexo-danger-text hover:bg-nexo-danger/15">
              <Trash2 className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {pending > 0 && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 rounded-nexo-lg px-4 py-3 flex items-center gap-3 text-sm text-nexo-warn-text">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            <strong>{pending}</strong> fetch{pending > 1 ? 'es' : ''} queued at DataForSEO ({fetched}/{listings.length} listings ready). The standard queue can take up to 45 minutes; this page checks every 30 seconds.
          </span>
          <AutoRefresh intervalMs={30_000} />
        </div>
      )}
      {failed.length > 0 && pending === 0 && failed.some((t) => t.createdAt >= Math.max(...listings.map((l) => l.lastFetchAt ?? 0))) && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 rounded-nexo-lg px-4 py-3 text-sm text-nexo-danger-text">
          Some fetches failed: {failed.map((t) => `${listings.find((l) => l.id === t.listingId)?.title ?? 'listing'} (${t.errorMessage ?? 'error'})`).join(' · ')}. Try “Refresh now”.
        </div>
      )}

      <nav className="flex gap-1 border-b border-nexo-border" aria-label="Analysis views">
        {(['overview', 'report', 'data'] as const).map((t) => (
          <Link key={t} href={tabHref(t)} aria-current={tab === t ? 'page' : undefined}
            className={`px-4 py-2.5 text-xs font-medium uppercase tracking-widest -mb-px border-b-2 transition-colors ${tab === t ? 'border-nexo-border-strong text-nexo-text' : 'border-transparent text-nexo-faint hover:text-white'}`}>
            {t}
          </Link>
        ))}
      </nav>

      {tab !== 'data' && !report && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-dashed border-nexo-border px-6 py-12 text-center">
          {pending > 0 ? (
            <>
              <p className="text-sm font-medium text-nexo-dim">Collecting the last 3 months of reviews…</p>
              <p className="text-xs text-nexo-faint mt-1">The ranking appears as soon as the first listing is fetched. Listings still missing are shown as n/a.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-nexo-dim">No reviews fetched yet.</p>
              <p className="text-xs text-nexo-faint mt-1">{credentials ? 'Use “Refresh now” to fetch the last 3 months of reviews for every listing.' : 'Configure your DataForSEO credentials in Settings, then use “Refresh now”.'}</p>
            </>
          )}
        </div>
      )}
      {tab === 'overview' && report && <OverviewView report={report} series={series} />}
      {tab === 'report' && report && (
        <ReportView report={report} context={context} exportBar={(
          <ExportExcelButton filename={`${fileStem(active.name)}-review-benchmark.xls`} sheets={excelSheets(report)} />
        )} />
      )}
      {tab === 'data' && <DataView benchmarkId={active.id} listings={listings} tasks={tasks} report={report} timeZone={active.timeZone} />}
    </div>
  );
}

export default withProjectScope(ReviewVelocityPage);
