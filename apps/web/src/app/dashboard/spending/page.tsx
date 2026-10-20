import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { CircleHelp, Info } from 'lucide-react';
import { getSpendByTool, getSpendByDay, getFirstSpendTs } from '@/lib/db';
import {
  SPEND_PRESETS, resolveSpendRange, bucketSpend, totalSpend, estimateToolCost, formatUsd,
  type SpendBucket,
} from '@/lib/spend';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

interface SearchParams {
  from?: string;
  to?: string;
  preset?: string;
}

function formatDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SpendChart({ buckets, unit }: { buckets: SpendBucket[]; unit: 'day' | 'month' }) {
  const max = Math.max(...buckets.map((b) => b.knownCost), 0);
  // Label roughly 6 evenly spaced buckets so labels never collide
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));

  return (
    <div>
      <div className="flex gap-3">
        {/* Y axis: just the top value and zero, grid stays recessive */}
        <div className="flex flex-col justify-between h-48 text-[10px] font-mono text-nexo-faint text-right shrink-0 w-14 -mt-1.5 pb-0">
          <span>{formatUsd(max)}</span>
          <span>$0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-48 border-b border-nexo-border">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-nexo-border" />
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {buckets.map((b, i) => {
                const pct = max > 0 ? (b.knownCost / max) * 100 : 0;
                const align = i < buckets.length / 4 ? 'left-0' : i > (buckets.length * 3) / 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';
                const label = `${b.label}: ${formatUsd(b.knownCost)} known, ${b.calls} call${b.calls !== 1 ? 's' : ''}${b.unknownCalls ? `, ${b.unknownCalls} with unknown cost` : ''}`;
                return (
                  <div key={b.key} tabIndex={0} aria-label={label}
                    className="group relative flex-1 h-full flex items-end outline-none">
                    <div
                      className="w-full rounded-t-[4px] bg-nexo-blue group-hover:bg-nexo-sky group-focus:bg-nexo-sky transition-colors"
                      style={{ height: b.knownCost > 0 ? `max(${pct}%, 2px)` : '0' }}
                    />
                    <div style={{ bottom: `calc(${pct}% + 8px)` }} className={`pointer-events-none absolute ${align} z-10 hidden group-hover:block group-focus:block whitespace-nowrap rounded-nexo bg-nexo-surface-2 px-3 py-2 `}>
                      <p className="text-sm font-medium text-white font-mono">{formatUsd(b.knownCost)}</p>
                      <p className="text-[10px] text-nexo-faint">{b.label} · {b.calls} call{b.calls !== 1 ? 's' : ''}</p>
                      {b.unknownCalls > 0 && (
                        <p className="text-[10px] text-nexo-warn-text">+ {b.unknownCalls} call{b.unknownCalls !== 1 ? 's' : ''} with unknown cost</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Unknown-cost markers sit under their bucket */}
          <div className="flex gap-[2px] h-3 items-center">
            {buckets.map((b) => (
              <div key={b.key} className="flex-1 flex justify-center">
                {b.unknownCalls > 0 && <span className="w-1.5 h-1.5 rounded-full bg-white/30" />}
              </div>
            ))}
          </div>
          <div className="flex gap-[2px] text-[10px] text-nexo-faint">
            {buckets.map((b, i) => (
              <div key={b.key} className="flex-1 min-w-0 relative h-4">
                {i % labelEvery === 0 && <span className="absolute left-0 whitespace-nowrap">{b.label}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-[11px] text-nexo-faint">
        <span>Known cost per {unit}</span>
        {buckets.some((b) => b.unknownCalls > 0) && (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            Includes calls with unknown cost
          </span>
        )}
      </div>
    </div>
  );
}

async function SpendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const firstTs = getFirstSpendTs();
  const range = resolveSpendRange(params, new Date(), firstTs);
  const tools = getSpendByTool(range.fromMs, range.toMs);
  const { unit, buckets } = bucketSpend(getSpendByDay(range.fromMs, range.toMs), range.from, range.to);
  const totals = totalSpend(tools);
  const hasUnknown = totals.unknownCalls > 0;

  const tableRows = tools.map((t) => {
    const est = estimateToolCost(t);
    return {
      tool: t.tool,
      calls: t.calls,
      known_cost: Number(t.knownCost.toFixed(6)),
      unknown_cost_calls: t.unknownCalls,
      avg_cost_per_call: t.avgKnownCost !== null ? Number(t.avgKnownCost.toFixed(6)) : '',
      estimated_total: est !== null ? Number(est.toFixed(6)) : '',
    };
  });
  const columns = [
    { key: 'tool', label: 'Tool' },
    { key: 'calls', label: 'Calls' },
    { key: 'known_cost', label: 'Known cost ($)' },
    { key: 'unknown_cost_calls', label: 'Unknown-cost calls' },
    { key: 'avg_cost_per_call', label: 'Avg cost per call ($)' },
    { key: 'estimated_total', label: 'Estimated total ($)' },
  ];

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-nexo text-xs font-medium transition-colors ${active
      ? 'bg-nexo-surface-2 text-white'
      : 'bg-nexo-surface border border-nexo-border text-nexo-dim hover:text-white hover:border-nexo-border'}`;
  const dateInput = 'nexo-input min-w-0 w-full px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-nexo-sky [color-scheme:light]';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Spending</h1>
        <p className="text-sm text-nexo-faint mt-1">What your DataForSEO calls cost, by tool, based on the cost saved with each search.</p>
      </div>

      {/* Date range: presets first, custom range after */}
      <div className="flex flex-wrap items-center gap-2">
        {SPEND_PRESETS.map((p) => (
          <Link key={p.key} href={`/dashboard/spending?preset=${p.key}`} className={pill(range.preset === p.key)}>
            {p.label}
          </Link>
        ))}
        <form method="get" action="/dashboard/spending" className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <label className="sr-only" htmlFor="spend-from">From</label>
          <input id="spend-from" type="date" name="from" defaultValue={range.from} required className={dateInput} />
          <span className="text-xs text-nexo-faint">to</span>
          <label className="sr-only" htmlFor="spend-to">To</label>
          <input id="spend-to" type="date" name="to" defaultValue={range.to} required className={dateInput} />
          <button type="submit" className="px-3 py-1.5 rounded-nexo bg-nexo-blue text-white text-xs font-medium uppercase tracking-widest hover:bg-nexo-sky transition-colors">
            Apply
          </button>
        </form>
      </div>
      <p className="text-xs text-nexo-faint -mt-3">
        {formatDay(range.from)} – {formatDay(range.to)}
      </p>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
          <p className="nexo-label">{hasUnknown ? 'Known spend' : 'Spend'}</p>
          <p className="text-3xl font-medium text-nexo-text tracking-tight mt-1 font-mono">{formatUsd(totals.knownCost)}</p>
          <p className="text-[11px] text-nexo-faint mt-1">
            {hasUnknown ? 'At least this much — excludes calls with unknown cost' : 'Every call in this range has a recorded cost'}
          </p>
        </div>
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
          <p className="nexo-label">Calls</p>
          <p className="text-3xl font-medium text-nexo-text tracking-tight mt-1 font-mono">{totals.calls.toLocaleString('en-US')}</p>
          <p className="text-[11px] text-nexo-faint mt-1">
            {hasUnknown
              ? `${totals.unknownCalls.toLocaleString('en-US')} with unknown cost`
              : totals.calls > 0 ? `${formatUsd(totals.knownCost / totals.calls)} on average` : 'No calls in this range'}
          </p>
        </div>
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
          <p className="nexo-label">Estimated total</p>
          <p className="text-3xl font-medium text-nexo-text tracking-tight mt-1 font-mono">
            {hasUnknown ? `~${formatUsd(totals.estimatedCost)}` : formatUsd(totals.knownCost)}
          </p>
          <p className="text-[11px] text-nexo-faint mt-1">
            {!hasUnknown
              ? 'Same as spend — nothing to estimate'
              : totals.unestimableCalls > 0
                ? `Unknown calls priced at their tool's average; ${totals.unestimableCalls} couldn't be priced`
                : "Unknown calls priced at their tool's average cost"}
          </p>
        </div>
      </div>

      {hasUnknown && (
        <div className="flex gap-3 bg-nexo-warn/10 border border-nexo-warn/40 rounded-nexo-lg px-4 py-3">
          <CircleHelp className="h-4 w-4 text-nexo-warn-text shrink-0 mt-0.5" />
          <p className="text-xs text-nexo-warn-text leading-relaxed">
            {totals.unknownCalls.toLocaleString('en-US')} call{totals.unknownCalls !== 1 ? 's' : ''} in this range {totals.unknownCalls !== 1 ? 'have' : 'has'} no recorded cost,
            usually because {totals.unknownCalls !== 1 ? 'they were' : 'it was'} made before the tool started saving costs. They count as calls but add nothing to the known spend.
            The estimate prices them at the tool&apos;s average known cost, which can differ from what DataForSEO actually charged.
          </p>
        </div>
      )}

      {tools.length === 0 ? (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center">
          <p className="text-sm text-nexo-dim">No DataForSEO calls recorded between {formatDay(range.from)} and {formatDay(range.to)}.</p>
          {firstTs !== null && range.preset !== 'all' && (
            <Link href="/dashboard/spending?preset=all" className="inline-block mt-3 text-xs font-medium text-nexo-sky hover:underline">
              Show all time
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6">
            <h2 className="nexo-label mb-6">Spend over time</h2>
            <SpendChart buckets={buckets} unit={unit} />
          </div>

          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between gap-3">
              <h2 className="nexo-label">By tool</h2>
              <div className="flex items-center gap-2">
                <CopyMarkdownButton data={tableRows} columns={columns} />
                <ExportCSVButton data={tableRows} columns={columns} filename={`spending-${range.from}-to-${range.to}.csv`} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="nexo-label border-b border-nexo-border">
                    <th className="text-left px-6 py-3">Tool</th>
                    <th className="text-right px-4 py-3">Calls</th>
                    <th className="text-right px-4 py-3">Known cost</th>
                    <th className="text-left px-4 py-3 w-40">Share</th>
                    <th className="text-right px-4 py-3">Unknown cost</th>
                    <th className="text-right px-4 py-3">Avg / call</th>
                    <th className="text-right px-6 py-3">Estimated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nexo-border">
                  {tools.map((t) => {
                    const share = totals.knownCost > 0 ? (t.knownCost / totals.knownCost) * 100 : 0;
                    const est = estimateToolCost(t);
                    return (
                      <tr key={t.tool} className="hover:bg-white/[0.04] transition-colors">
                        <td className="px-6 py-3 font-medium text-nexo-text whitespace-nowrap">
                          {t.href
                            ? <Link href={t.href} className="hover:text-nexo-sky hover:underline">{t.tool}</Link>
                            : t.tool}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-nexo-dim">{t.calls.toLocaleString('en-US')}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-nexo-text">
                          {t.unknownCalls === t.calls ? <span className="font-normal text-nexo-faint">unknown</span> : formatUsd(t.knownCost)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-nexo-surface-2 overflow-hidden">
                              <div className="h-full rounded-full bg-nexo-blue" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-nexo-faint w-9 text-right">{share.toFixed(share > 0 && share < 1 ? 1 : 0)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-nexo-faint">
                          {t.unknownCalls > 0
                            ? <span className="text-nexo-warn-text">{t.unknownCalls} call{t.unknownCalls !== 1 ? 's' : ''}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-nexo-dim">
                          {t.avgKnownCost !== null ? formatUsd(t.avgKnownCost) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right font-mono text-nexo-dim whitespace-nowrap">
                          {t.unknownCalls === 0 ? '—' : est !== null ? `~${formatUsd(est)}` : <span title="This tool never recorded a cost, so there is no average to estimate from">can&apos;t estimate</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-3 rounded-nexo-lg border border-nexo-border px-4 py-3">
        <Info className="h-4 w-4 text-nexo-faint shrink-0 mt-0.5" />
        <div className="text-xs text-nexo-dim leading-relaxed space-y-1">
          <p>
            Totals come from the searches saved in this app, so they can be lower than the change in your DataForSEO balance.
            Not counted: Content Parsing (doesn&apos;t save its cost), searches that failed or returned no results and weren&apos;t saved,
            and deleted rank-tracked keywords. When the same search is fetched again, or a keyword is rank-checked twice on the same day,
            only the latest cost is kept.
          </p>
          <p>Days follow this server&apos;s local time zone.</p>
        </div>
      </div>
    </div>
  );
}

export default withProjectScope(SpendingPage);
