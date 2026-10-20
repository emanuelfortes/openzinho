import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials,
  getKwOverviewHistory,
  saveKwOverviewSearch,
  getKwOverviewResults,
  getSetting,
  type KwOverviewSearchEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import KeywordOverviewTable from './KeywordOverviewTable';

// ---- Types ----

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface KeywordInfo {
  search_volume?: number;
  cpc?: number;
  competition?: number;
  competition_level?: string;
  monthly_searches?: MonthlySearch[];
}

interface KeywordProperties {
  keyword_difficulty?: number;
}

interface SearchIntentInfo {
  main_intent?: string;
}

interface ImpressionsInfo {
  daily_impressions_min?: number;
  daily_impressions_max?: number;
}

export interface KwOverviewItem {
  keyword?: string;
  keyword_info?: KeywordInfo;
  keyword_properties?: KeywordProperties;
  search_intent_info?: SearchIntentInfo;
  impressions_info?: ImpressionsInfo;
}

interface SearchParams {
  keywords?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

// ---- API ----

async function fetchKeywordOverview(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: KwOverviewItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: KwOverviewItem[] }>(
    'dataforseo_labs/google/keyword_overview/live',
    { keywords, location_name: location, language_name: language },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

async function KeywordOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const rawKeywords = params.keywords ?? '';
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: KwOverviewItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: KwOverviewSearchEntry | null = null;

  if (historyId) {
    const saved = getKwOverviewResults<KwOverviewItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getKwOverviewHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  }

  const keywords = rawKeywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);

  if (!historyId && keywords.length > 0) {
    const dedupeId = stableSearchId(['keyword-overview', keywords.join(','), location, language]);
    const cached = getKwOverviewResults<KwOverviewItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getKwOverviewHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchKeywordOverview(keywords, location, language, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && items.length > 0) {
        const label = keywords.slice(0, 3).join(', ');
        const entry: KwOverviewSearchEntry = {
          id: dedupeId,
          ts: Date.now(),
          keywords: label.length > 80 ? label.slice(0, 77) + '…' : label,
          location,
          language,
          count: items.length,
          cost,
        };
        saveKwOverviewSearch(entry, items);
      }
    }
  }

  const history = getKwOverviewHistory();
  const hasQuery = historyId || keywords.length > 0;

  // Aggregate stats
  const avgDifficulty = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.keyword_properties?.keyword_difficulty ?? 0), 0) / items.length)
    : null;
  const totalVolume = items.reduce((s, i) => s + (i.keyword_info?.search_volume ?? 0), 0);

  const csvData = items.map((item) => ({
    keyword: item.keyword ?? '',
    search_volume: item.keyword_info?.search_volume ?? '',
    kd: item.keyword_properties?.keyword_difficulty ?? '',
    intent: item.search_intent_info?.main_intent ?? '',
    competition_level: item.keyword_info?.competition_level ?? '',
    cpc: item.keyword_info?.cpc != null ? item.keyword_info.cpc.toFixed(2) : '',
  }));
  const csvColumns = [
    { key: 'keyword', label: 'Keyword' },
    { key: 'search_volume', label: 'Volume' },
    { key: 'kd', label: 'KD' },
    { key: 'intent', label: 'Intent' },
    { key: 'competition_level', label: 'Competition' },
    { key: 'cpc', label: 'CPC' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Keyword Overview</h1>
        <p className="text-sm text-nexo-faint mt-1">Detailed SEO metrics per keyword via DataForSEO Labs.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analyze" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">
              Keywords <span className="text-nexo-faint normal-case font-normal">(one per line, max 1000)</span>
            </label>
            <textarea
              name="keywords"
              defaultValue={activeEntry ? '' : rawKeywords}
              rows={5}
              placeholder={"plumber paris\nsink unclogging\nplumbing leak"}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono resize-y"
            />
          </div>
          <LabsLocationLanguageFields
            defaultLocation={activeEntry?.location ?? location}
            defaultLanguage={activeEntry?.language ?? language}
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {/* Summary stats */}
      {hasQuery && !error && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
            <p className="nexo-label">Keywords</p>
            <p className="text-2xl font-medium text-nexo-text mt-1">{items.length}</p>
          </div>
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
            <p className="nexo-label">Total volume</p>
            <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{totalVolume.toLocaleString("en-GB")}</p>
          </div>
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
            <p className="nexo-label">Avg KD</p>
            <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{avgDifficulty ?? '—'}</p>
          </div>
        </div>
      )}

      {/* Results table */}
      {hasQuery && !error && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="nexo-label">Results</h2>
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-medium text-nexo-faint">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={csvColumns} />
                  <ExportCSVButton data={csvData} filename="keyword-overview.csv" columns={csvColumns} />
                </div>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">No results.</div>
          ) : (
            <KeywordOverviewTable items={items} />
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">History</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/keyword-overview?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.location} · {entry.count} keyword{entry.count !== 1 ? 's' : ''}
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-nexo-faint">{formatDate(entry.ts)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(KeywordOverviewPage);
