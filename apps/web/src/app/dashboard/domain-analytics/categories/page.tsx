import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getDomainCategoriesHistory, saveDomainCategoriesSearch, getDomainCategoriesResults, getCategoryPath, type DomainCategoriesEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import CategoriesList from './CategoriesList';

interface CategoryItem {
  categories?: number[];
  metrics?: {
    organic?: { etv?: number; count?: number };
  };
}

interface SearchParams { target?: string; location?: string; language?: string; history_id?: string; }

async function fetchCategories(target: string, location: string, language: string, login: string, pass: string): Promise<{ items: CategoryItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: CategoryItem[] }>(
    'dataforseo_labs/google/categories_for_domain/live',
    { target, location_name: location, language_name: language },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function DomainCategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const historyId = params.history_id;

  let items: CategoryItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: DomainCategoriesEntry | null = null;

  if (historyId) {
    const saved = getDomainCategoriesResults<CategoryItem>(historyId);
    if (saved) { items = saved; activeEntry = getDomainCategoriesHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget) {
    const dedupeId = stableSearchId(['domain-categories', rawTarget, location, language]);
    const cached = getDomainCategoriesResults<CategoryItem>(dedupeId);
    if (cached) {
      items = cached;
      const cachedEntry = getDomainCategoriesHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchCategories(rawTarget, location, language, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: DomainCategoriesEntry = { id: dedupeId, ts: Date.now(), target: rawTarget, location, language, count: items.length, cost };
        saveDomainCategoriesSearch(entry, items);
      }
    }
  }

  const history = getDomainCategoriesHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const resolvedItems = items.map((item) => ({
    categoryPaths: (item.categories ?? []).map((c) => getCategoryPath(c)),
    count: item.metrics?.organic?.count ?? 0,
    etv: item.metrics?.organic?.etv ?? 0,
  }));

  const csvData = resolvedItems.map((item) => ({
    category: item.categoryPaths.join(' | '),
    keywords: item.count,
    etv: item.etv.toFixed(0),
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/domain-analytics" className="hover:text-white transition-colors">Domain Analytics</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Categories</span>
        </div>
        <h1 className="nexo-h1">Domain Categories</h1>
        <p className="text-sm text-nexo-faint mt-1">Thematic categories that best describe a domain&apos;s organic content.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analyze" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Domain</label>
            <input type="text" name="target" defaultValue={displayTarget} placeholder="example.com" required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
          </div>
          <LabsLocationLanguageFields
            defaultLocation={displayLocation}
            defaultLanguage={displayLanguage}
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || rawTarget) && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <span className="nexo-label">{items.length} categories — {displayTarget}</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={[{key:'category',label:'Category'},{key:'keywords',label:'Keywords'},{key:'etv',label:'Est. Traffic (ETV)'}]} />
                  <ExportCSVButton data={csvData} filename={`categories-${displayTarget}.csv`} columns={[{key:'category',label:'Category'},{key:'keywords',label:'Keywords'},{key:'etv',label:'Est. Traffic (ETV)'}]} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">No categories found.</div>
          ) : (
            <CategoriesList items={resolvedItems} />
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
                <a key={entry.id} href={`/dashboard/domain-analytics/categories?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} categories{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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

export default withProjectScope(DomainCategoriesPage);
