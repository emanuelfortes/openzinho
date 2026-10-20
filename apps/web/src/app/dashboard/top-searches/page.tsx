import { withProjectScope } from '@/lib/db';
import {
  getCredentials, getSetting,
  getTopSearchesHistory, saveTopSearches, getTopSearchesResults,
  type TopSearchesEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import TopSearchesTable from './TopSearchesTable';

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface TopSearchItem {
  keyword: string;
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number;
    competition_level?: string;
    monthly_searches?: MonthlySearch[];
  };
  keyword_properties?: {
    keyword_difficulty?: number;
    word_count?: number;
    detected_language?: string;
  };
  search_intent_info?: {
    main_intent?: string;
  };
  avg_backlinks_info?: {
    referring_domains?: number;
  };
}

interface SearchParams {
  location?: string;
  language?: string;
  limit?: string;
  ignore_synonyms?: string;
  history_id?: string;
}

async function fetchTopSearches(
  location: string,
  language: string,
  limit: number,
  ignoreSynonyms: boolean,
  login: string,
  pass: string,
): Promise<{ items: TopSearchItem[]; totalCount?: number; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: TopSearchItem[]; total_count?: number }>(
    'dataforseo_labs/google/top_searches/live',
    { location_name: location, language_name: language, limit, ignore_synonyms: ignoreSynonyms, include_serp_info: false },
    { login, pass }, 30_000,
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], totalCount: result?.total_count, cost };
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const COST_PER_1000 = 0.05;

async function TopSearchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(Math.max(parseInt(params.limit ?? '100', 10) || 100, 1), 1000);
  const ignoreSynonyms = params.ignore_synonyms === 'true';

  let items: TopSearchItem[] = [];
  let cost: number | undefined;
  let totalCount: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: TopSearchesEntry | null = null;

  if (historyId) {
    const saved = getTopSearchesResults<TopSearchItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getTopSearchesHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
      totalCount = activeEntry?.totalCount;
      cost = activeEntry?.cost;
    } else {
      error = 'This search is no longer available.';
    }
  }

  const hasQuery = !!(historyId || params.location || params.language || params.limit);

  if (!historyId && (params.location || params.language || params.limit)) {
    const dedupeId = stableSearchId(['top-searches', location, language, limit, ignoreSynonyms]);
    const cached = getTopSearchesResults<TopSearchItem>(dedupeId);

    if (cached) {
      items = cached;
      isFromHistory = true;
      const cachedEntry = getTopSearchesHistory().find((e) => e.id === dedupeId);
      activeEntry = cachedEntry ?? null;
      totalCount = cachedEntry?.totalCount;
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await fetchTopSearches(location, language, limit, ignoreSynonyms, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      totalCount = result.totalCount;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const entry: TopSearchesEntry = {
          id: dedupeId,
          ts: Date.now(),
          location,
          language,
          limitCount: limit,
          count: items.length,
          totalCount,
          cost,
        };
        saveTopSearches(entry, items);
      }
    }
  }

  const history = getTopSearchesHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const displayLimit = activeEntry?.limitCount ?? limit;

  const estimatedCost = (limit * COST_PER_1000 / 1000).toFixed(4);

  const csvData = items.map((item) => ({
    keyword: item.keyword ?? '',
    search_volume: item.keyword_info?.search_volume ?? '',
    cpc: item.keyword_info?.cpc != null ? item.keyword_info.cpc.toFixed(2) : '',
    competition_level: item.keyword_info?.competition_level ?? '',
    keyword_difficulty: item.keyword_properties?.keyword_difficulty ?? '',
    word_count: item.keyword_properties?.word_count ?? '',
    intent: item.search_intent_info?.main_intent ?? '',
    ref_domains: item.avg_backlinks_info?.referring_domains ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Top Searches</h1>
        <p className="text-sm text-nexo-faint mt-1">The most searched keywords for a given location and language, via DataForSEO Labs.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Search" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabsLocationLanguageFields
            defaultLocation={displayLocation}
            defaultLanguage={displayLanguage}
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
          <div>
            <label className="nexo-label block mb-1.5">Number of results</label>
            <select name="limit" defaultValue={String(displayLimit)}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer pb-2.5">
              <input type="checkbox" name="ignore_synonyms" value="true" defaultChecked={ignoreSynonyms}
                className="w-4 h-4 rounded border-nexo-border text-nexo-sky focus:ring-nexo-sky" />
              <span className="text-sm text-nexo-dim font-medium">Ignore synonyms</span>
            </label>
          </div>
        </div>
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 rounded-nexo-lg px-4 py-3">
          <p className="text-[11px] text-nexo-warn-text">
            Cost: <span className="font-medium">${COST_PER_1000} / 1,000 keywords</span> — estimated for {limit} results:{' '}
            <span className="font-medium">${estimatedCost}</span>
          </p>
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {hasQuery && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="nexo-label">Results</h2>
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">History</span>}
              {totalCount !== undefined && (
                <span className="text-[10px] text-nexo-faint font-mono">{fmt(totalCount)} total</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-medium text-nexo-faint">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton
                    data={csvData}
                    columns={[
                      { key: 'keyword', label: 'Keyword' },
                      { key: 'search_volume', label: 'Search Volume' },
                      { key: 'cpc', label: 'CPC' },
                      { key: 'competition_level', label: 'Competition' },
                      { key: 'keyword_difficulty', label: 'KD' },
                      { key: 'word_count', label: 'Word Count' },
                      { key: 'intent', label: 'Intent' },
                      { key: 'ref_domains', label: 'Avg Ref. Domains' },
                    ]}
                  />
                  <ExportCSVButton
                    data={csvData}
                    filename={`top-searches-${displayLocation}-${displayLanguage}.csv`}
                    columns={[
                      { key: 'keyword', label: 'Keyword' },
                      { key: 'search_volume', label: 'Search Volume' },
                      { key: 'cpc', label: 'CPC' },
                      { key: 'competition_level', label: 'Competition' },
                      { key: 'keyword_difficulty', label: 'KD' },
                      { key: 'word_count', label: 'Word Count' },
                      { key: 'intent', label: 'Intent' },
                      { key: 'ref_domains', label: 'Avg Ref. Domains' },
                    ]}
                  />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">No results found.</div>
          ) : (
            <TopSearchesTable items={items} />
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">History</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/top-searches?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>
                      {entry.location} · {entry.language}
                    </p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.count} keywords
                      {entry.totalCount !== undefined ? ` / ${fmt(entry.totalCount)} total` : ''}
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

export default withProjectScope(TopSearchesPage);
