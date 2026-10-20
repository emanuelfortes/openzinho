import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getSearchIntentHistory, saveSearchIntentSearch, getSearchIntentResults, type SearchIntentEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import SearchIntentTable from './SearchIntentTable';

interface IntentItem {
  keyword?: string;
  keyword_intent?: { label?: string; probability?: number } | null;
  secondary_keyword_intents?: Array<{ label?: string; probability?: number }> | null;
}

interface SearchParams { keywords?: string; location?: string; language?: string; history_id?: string; }

async function fetchIntent(keywords: string[], location: string, language: string, login: string, pass: string): Promise<{ items: IntentItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: IntentItem[] }>(
    'dataforseo_labs/google/search_intent/live',
    { keywords, location_name: location, language_name: language },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

const INTENT_CONFIG: Record<string, { label: string; cls: string }> = {
  informational: { label: 'Informational', cls: 'bg-nexo-blue/10 text-nexo-sky border-nexo-border-strong' },
  navigational:  { label: 'Navigational',  cls: 'bg-nexo-blue/10 text-nexo-sky border-nexo-border-strong' },
  commercial:    { label: 'Commercial',    cls: 'bg-nexo-warn/10 text-nexo-warn-text border-nexo-warn/40' },
  transactional: { label: 'Transactional', cls: 'bg-nexo-ice/10 text-nexo-ice border-nexo-ice/30' },
};

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function SearchIntentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawKeywords = params.keywords?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const historyId = params.history_id;

  let items: IntentItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: SearchIntentEntry | null = null;

  if (historyId) {
    const saved = getSearchIntentResults<IntentItem>(historyId);
    if (saved) { items = saved; activeEntry = getSearchIntentHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawKeywords) {
    const kwList = rawKeywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
    const dedupeId = stableSearchId(['search-intent', kwList.join(','), location, language]);
    const cached = getSearchIntentResults<IntentItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getSearchIntentHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchIntent(kwList, location, language, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: SearchIntentEntry = { id: dedupeId, ts: Date.now(), keywords: kwList.join(', '), location, language, count: items.length, cost };
        saveSearchIntentSearch(entry, items);
      }
    }
  }

  const history = getSearchIntentHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const getMainIntent = (item: IntentItem) => item.keyword_intent?.label;
  const getSecondaryIntents = (item: IntentItem) =>
    item.secondary_keyword_intents?.map((s) => s.label).filter(Boolean) as string[] | undefined;

  const intentCounts = items.reduce<Record<string, number>>((acc, item) => {
    const intent = getMainIntent(item) ?? 'unknown';
    acc[intent] = (acc[intent] ?? 0) + 1;
    return acc;
  }, {});

  const csvData = items.map((item) => ({
    keyword: item.keyword ?? '',
    intent: getMainIntent(item) ?? '',
    secondary: (getSecondaryIntents(item) ?? []).join(', '),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Search Intent</h1>
        <p className="text-sm text-nexo-faint mt-1">Classify keywords by intent: informational, navigational, commercial or transactional.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Classify" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Keywords <span className="normal-case font-normal tracking-normal text-nexo-faint">(one per line, max 1000)</span></label>
            <textarea name="keywords" rows={6} defaultValue={activeEntry?.keywords?.split(', ').join('\n') ?? rawKeywords} placeholder={"plumber paris\nemergency drain repair\nbest plumber"} required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono resize-y" />
          </div>
          <LabsLocationLanguageFields
            defaultLocation={displayLocation}
            defaultLanguage={displayLanguage}
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {/* Intent summary pills */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).map(([intent, count]) => {
            const cfg = INTENT_CONFIG[intent];
            return (
              <div key={intent} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-nexo-lg border text-xs font-medium ${cfg?.cls ?? 'bg-white/[0.02] text-nexo-dim border-nexo-border'}`}>
                <span>{cfg?.label ?? intent}</span>
                <span className="font-medium">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {(historyId || rawKeywords) && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <span className="nexo-label">{items.length} keywords</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={[{key:'keyword',label:'Keyword'},{key:'intent',label:'Main Intent'},{key:'secondary',label:'Secondary Intents'}]} />
                  <ExportCSVButton data={csvData} filename="search-intent.csv" columns={[{key:'keyword',label:'Keyword'},{key:'intent',label:'Main Intent'},{key:'secondary',label:'Secondary Intents'}]} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">No results found.</div>
          ) : (
            <SearchIntentTable items={items} />
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
                <a key={entry.id} href={`/dashboard/search-intent?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} keywords · {entry.location}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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

export default withProjectScope(SearchIntentPage);
