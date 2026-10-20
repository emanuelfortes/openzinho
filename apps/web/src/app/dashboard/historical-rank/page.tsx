import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { getCredentials, getHistRankHistory, saveHistRankSearch, getHistRankResults, getSetting } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import RankDistributionChart from './RankDistributionChart';

const HISTORICAL_RANK_START = '2020-10-01';

interface HistRankItem {
  se_type?: string;
  year: number;
  month: number;
  metrics: {
    organic?: {
      count?: number;
      pos_1?: number;
      pos_2_3?: number;
      pos_4_10?: number;
      pos_11_20?: number;
      pos_21_30?: number;
      pos_31_40?: number;
      pos_41_50?: number;
      pos_51_60?: number;
      pos_61_70?: number;
      pos_71_80?: number;
      pos_81_90?: number;
      pos_91_100?: number;
      etv?: number;
    };
  };
}

interface SearchParams {
  target?: string;
  location?: string;
  language?: string;
  date_from?: string;
  date_to?: string;
  history_id?: string;
}

async function fetchHistRank(target: string, location: string, language: string, dateFrom: string, dateTo: string, login: string, pass: string): Promise<{ items: HistRankItem[]; cost: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: HistRankItem[] }>(
    'dataforseo_labs/google/historical_rank_overview/live',
    { target, location_name: location, language_name: language, date_from: dateFrom, date_to: dateTo, correlate: true },
    { login, pass },
  );
  if (error) return { items: [], cost: 0, error };
  return { items: result?.items ?? [], cost: cost ?? 0 };
}

function formatMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: string | undefined, fallback: string, max: string) {
  const date = value?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fallback;
  if (date < HISTORICAL_RANK_START) return HISTORICAL_RANK_START;
  if (date > max) return max;
  return date;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-nexo-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono font-medium text-nexo-dim w-10 text-right">{value.toLocaleString()}</span>
    </div>
  );
}

async function HistoricalRankPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const history = getHistRankHistory();
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const selectedHistory = historyId ? history.find((entry) => entry.id === historyId) : undefined;
  const maxDate = todayIso();
  const dateFrom = selectedHistory?.dateFrom ?? normalizeDate(params.date_from, HISTORICAL_RANK_START, maxDate);
  const dateTo = selectedHistory?.dateTo ?? normalizeDate(params.date_to, maxDate, maxDate);
  const target = params.target?.trim() || selectedHistory?.target || '';
  const location = params.location ?? selectedHistory?.location ?? defaultLocation;
  const language = params.language ?? selectedHistory?.language ?? defaultLanguage;

  let items: HistRankItem[] = [];
  let error = '';
  let cost = 0;

  if (dateFrom > dateTo) {
    error = 'Choose a start date on or before the end date.';
  } else if (historyId) {
    items = getHistRankResults<HistRankItem>(historyId) ?? [];
  } else if (target && creds) {
    try {
      const dedupeId = stableSearchId(['historical-rank', target, location, language, dateFrom, dateTo]);
      const cachedItems = getHistRankResults<HistRankItem>(dedupeId);
      if (cachedItems) {
        items = cachedItems;
        cost = history.find((h) => h.id === dedupeId)?.cost ?? 0;
      } else {
        const result = await fetchHistRank(target, location, language, dateFrom, dateTo, creds.login, creds.pass);
        if (result.error) {
          error = result.error;
        } else {
          items = result.items;
          cost = result.cost;
          saveHistRankSearch({ id: dedupeId, ts: Date.now(), target, location, language, dateFrom, dateTo, cost }, items);
        }
      }
    } catch (e) {
      error = String(e);
    }
  }

  // Sort ascending (oldest → newest) for the time-series visuals; descending for the table.
  const sorted = [...items].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const maxCount = Math.max(...sorted.map((i) => i.metrics.organic?.count ?? 0), 1);

  // Sparkline
  const sparkData = sorted.map((i) => i.metrics.organic?.count ?? 0);
  const sparkMax = Math.max(...sparkData, 1);
  const W = 300;
  const H = 48;
  const xStep = sparkData.length > 1 ? W / (sparkData.length - 1) : 0;
  const sparkPath = sparkData.map((v, i) => {
    const x = i * xStep;
    const y = H - (v / sparkMax) * (H - 4) - 2;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="nexo-h1">Historical Rank Overview</h1>
        <p className="text-nexo-dim text-sm mt-1 font-medium">Monthly keyword count and SERP-position mix for a domain</p>
      </div>

      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-6 space-y-4" btnLabel="Analyze" btnClassName="w-full bg-nexo-blue text-white py-3 rounded-nexo-lg font-medium uppercase text-[10px] tracking-widest hover:bg-nexo-sky transition-all disabled:opacity-40" disabled={!creds}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 space-y-1.5">
                <label className="nexo-label">Target Domain</label>
                <input name="target" type="text" defaultValue={target || defaultDomain} placeholder="example.com" className="nexo-input min-w-0 w-full px-4 py-3 outline-none focus:ring-4 focus:ring-nexo-sky text-sm font-medium transition-all" />
              </div>
              <LabsLocationLanguageFields
                defaultLocation={location}
                defaultLanguage={language}
                className="w-full px-4 py-3 bg-white/[0.02] border border-nexo-border rounded-nexo-lg outline-none text-sm font-medium text-nexo-text"
                wrapperClassName="space-y-1.5"
                labelClassName="nexo-label "
              />
              <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-nexo-border pt-4">
                <div className="space-y-1.5">
                  <label className="nexo-label">From</label>
                  <input name="date_from" type="date" defaultValue={dateFrom} min={HISTORICAL_RANK_START} max={maxDate} className="nexo-input min-w-0 w-full px-4 py-3 outline-none focus:ring-4 focus:ring-nexo-sky text-sm font-medium transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="nexo-label">To</label>
                  <input name="date_to" type="date" defaultValue={dateTo} min={HISTORICAL_RANK_START} max={maxDate} className="nexo-input min-w-0 w-full px-4 py-3 outline-none focus:ring-4 focus:ring-nexo-sky text-sm font-medium transition-all" />
                </div>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-nexo-faint">Historical Rank data is available from October 2020. The full period is selected by default.</p>
            {!creds && <p className="text-xs text-nexo-warn-text font-medium">Configure API credentials in Settings first.</p>}
          </SearchForm>

          {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text rounded-nexo-lg px-5 py-3 text-sm">{error}</div>}

          {sorted.length > 0 && (
            <div className="space-y-4">
              {/* Sparkline card */}
              <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-6">
                <p className="nexo-label mb-3">
                  Total Keywords in Google Top 100
                  {cost > 0 && <span className="ml-3 text-nexo-faint">· ${cost.toFixed(4)}</span>}
                </p>
                <div className="flex items-end gap-6">
                  <svg width={W} height={H} className="overflow-visible">
                    {sparkData.length > 1 && (
                      <path d={sparkPath + ` L ${((sparkData.length - 1) * xStep).toFixed(1)} ${H} L 0 ${H} Z`} fill="#3b82f6" fillOpacity="0.12" />
                    )}
                    {sparkData.length > 1 && <path d={sparkPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                  </svg>
                  <div>
                    <div className="text-3xl font-medium text-nexo-text">{(sorted[sorted.length - 1]?.metrics.organic?.count ?? 0).toLocaleString()}</div>
                    <div className="nexo-label">Latest ({formatMonth(sorted[sorted.length - 1].year, sorted[sorted.length - 1].month)})</div>
                  </div>
                </div>
              </div>

              <RankDistributionChart points={sorted} />

              {/* Monthly table */}
              <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-nexo-border">
                      <th className="nexo-label text-left px-5 py-3.5">Month</th>
                      <th className="nexo-label text-left px-3 py-3.5">Total KWs</th>
                      <th className="nexo-label text-right px-3 py-3.5">#1</th>
                      <th className="nexo-label text-right px-3 py-3.5">2–3</th>
                      <th className="nexo-label text-right px-3 py-3.5">4–10</th>
                      <th className="nexo-label text-right px-3 py-3.5">11–30</th>
                      <th className="nexo-label text-right px-3 py-3.5">ETV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nexo-border">
                    {[...sorted].reverse().map((item, i) => {
                      const m = item.metrics.organic ?? {};
                      return (
                        <tr key={i} className="hover:bg-white/[0.04]">
                          <td className="px-5 py-3 font-medium text-nexo-text">{formatMonth(item.year, item.month)}</td>
                          <td className="px-3 py-3">
                            <Bar value={m.count ?? 0} max={maxCount} color="bg-nexo-sky/40" />
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-medium text-nexo-ice">{(m.pos_1 ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-nexo-sky">{(m.pos_2_3 ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-nexo-dim">{(m.pos_4_10 ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-nexo-faint">{((m.pos_11_20 ?? 0) + (m.pos_21_30 ?? 0)).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-nexo-dim">{Math.round(m.etv ?? 0).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-5 sticky top-6">
            <h2 className="nexo-label mb-4">History</h2>
            {history.length === 0 ? (
              <p className="text-xs text-nexo-faint">No searches yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <a key={h.id} href={`?history_id=${h.id}`} className="block rounded-nexo-lg px-3 py-2.5 hover:bg-white/[0.04] transition-colors border border-transparent hover:border-nexo-border">
                    <div className="font-medium text-xs text-nexo-text">{h.target}</div>
                    <div className="text-[10px] text-nexo-faint mt-0.5">
                      {h.location} · {h.dateFrom && h.dateTo ? `${h.dateFrom} → ${h.dateTo}` : new Date(h.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default withProjectScope(HistoricalRankPage);
