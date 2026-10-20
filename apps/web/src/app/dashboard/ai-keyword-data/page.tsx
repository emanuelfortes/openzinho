import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getAiKwDataHistory, saveAiKwDataSearch, getAiKwDataResults,
  type AiKwDataEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import HistorySidebar from '@/components/HistorySidebar';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import AiKeywordDataTable from './AiKeywordDataTable';

// ---- Types ----

interface MonthlyAiSearch {
  year: number;
  month: number;
  ai_search_volume: number;
}

interface AiKeywordItem {
  keyword?: string;
  ai_search_volume?: number;
  ai_monthly_searches?: MonthlyAiSearch[];
}

interface SearchParams {
  keywords?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

// ---- API ----

async function fetchAiKeywordData(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: AiKeywordItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: AiKeywordItem[] }>(
    'ai_optimization/ai_keyword_data/keywords_search_volume/live',
    { keywords, location_name: location, language_name: language },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

async function AiKeywordDataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const keywords = params.keywords?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: AiKeywordItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: AiKwDataEntry | null = null;

  if (historyId) {
    const saved = getAiKwDataResults<AiKeywordItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      activeEntry = getAiKwDataHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Search no longer available.';
    }
  }

  const hasQuery = !!(historyId || keywords);

  if (!historyId && keywords) {
    const kwList = keywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
    const dedupeId = stableSearchId(['ai-keyword-data', kwList.join('\n'), location, language]);
    const cached = getAiKwDataResults<AiKeywordItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getAiKwDataHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await fetchAiKeywordData(kwList, location, language, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const label = kwList.slice(0, 3).join(', ') + (kwList.length > 3 ? '…' : '');
        const entry: AiKwDataEntry = {
          id: dedupeId,
          ts: Date.now(),
          keywords: label,
          location,
          language,
          count: items.length,
          cost,
        };
        saveAiKwDataSearch(entry, items);
      }
    }
  }

  const history = getAiKwDataHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const totalVolume = items.reduce((s, i) => s + (i.ai_search_volume ?? 0), 0);

  const historyItems = history.map((entry) => {
    const isActive = entry.id === historyId;
    return (
      <a key={entry.id} href={`/dashboard/ai-keyword-data?history_id=${entry.id}#results`}
        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keywords}</p>
          <p className="text-[11px] text-nexo-faint mt-0.5">
            {entry.count} keyword{entry.count !== 1 ? 's' : ''}
            {' · '}{entry.location}
            {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-nexo-faint">{formatDate(entry.ts)}</span>
      </a>
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">AI Keyword Data</h1>
        <p className="text-sm text-nexo-faint mt-1">Search volume estimates reflecting keyword usage in AI tools (ChatGPT, Gemini, etc.), via DataForSEO.</p>
      </div>

      {!creds && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text text-sm rounded-nexo-lg px-4 py-3">
          DataForSEO credentials missing. Configure them in{' '}
          <a href="/dashboard/settings" className="underline font-semibold">settings</a>.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <SearchForm
            className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
            btnLabel="Analyze"
            btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-sky transition-colors"
            loadingLabel="Fetching AI search volume…"
            disabled={!creds}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="nexo-label block mb-1.5">
                  Keywords <span className="text-nexo-faint font-normal normal-case tracking-normal">(one per line, max 1000)</span>
                </label>
                <textarea
                  name="keywords"
                  defaultValue={activeEntry ? '' : keywords}
                  rows={6}
                  placeholder={'plumber paris\nbest italian restaurant\nseo agi'}
                  required
                  className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all font-mono resize-y"
                />
              </div>
              <LabsLocationLanguageFields
                defaultLocation={displayLocation}
                defaultLanguage={displayLanguage}
                className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
              />
            </div>
          </SearchForm>

          {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

          {hasQuery && !error && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                <p className="nexo-label">Keywords</p>
                <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{items.length}</p>
              </div>
              <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                <p className="nexo-label">Total AI volume</p>
                <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{totalVolume.toLocaleString('en-GB')}</p>
              </div>
            </div>
          )}

          {hasQuery && !error && (
            <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="nexo-label">Results</h2>
                  {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">History</span>}
                </div>
                <div className="flex items-center gap-3">
                  {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
                  <span className="text-xs font-medium text-nexo-faint">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
                  {items.length > 0 && (
                    <CopyMarkdownButton
                      data={items.map((i) => ({ keyword: i.keyword ?? '', ai_search_volume: i.ai_search_volume ?? '' }))}
                      columns={[{ key: 'keyword', label: 'Keyword' }, { key: 'ai_search_volume', label: 'AI Volume' }]}
                    />
                  )}
                </div>
              </div>
              {items.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-nexo-faint">No results found.</div>
              ) : (
                <AiKeywordDataTable items={items} />
              )}
            </div>
          )}

          {!hasQuery && !error && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-16 text-center">
              <p className="text-nexo-faint text-sm">Enter keywords above to see their estimated search volume inside AI tools.</p>
              <p className="text-nexo-faint text-xs mt-1">Powered by DataForSEO AI Keyword Data API.</p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <HistorySidebar title="History" items={historyItems} />
        )}
      </div>
    </div>
  );
}

export default withProjectScope(AiKeywordDataPage);
