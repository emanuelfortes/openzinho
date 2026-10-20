import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getTargetDomains, getSerpHistory, saveSerpSearch, getSerpResults, type SerpHistoryEntry, type TargetHit } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import { addDomainAction, removeDomainAction } from './actions';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';

interface SerpItem {
  type: string;
  rank_group: number;
  title?: string;
  description?: string;
  url?: string;
  domain?: string;
  breadcrumb?: string;
}

interface SearchParams {
  keyword?: string;
  location?: string;
  language?: string;
  device?: string;
  depth?: string;
  history_id?: string;
}

function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

async function fetchSerp(
  keyword: string, location: string, language: string, device: string, depth: number,
  login: string, pass: string,
): Promise<{ items: SerpItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: SerpItem[] }>(
    'serp/google/organic/live/advanced',
    { keyword, location_name: location, language_name: language, device, depth },
    { login, pass },
  );
  if (error) return { items: [], cost, error };
  return { items: result?.items?.filter((i) => i.type === 'organic') ?? [], cost };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' });
}

async function SerpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const targetDomains = getTargetDomains();
  const history = getSerpHistory();

  const params = await searchParams;
  const historyId = params.history_id;
  const keyword = params.keyword?.trim() ?? '';
  const location = params.location ?? getSetting('default_location') ?? 'France';
  const language = params.language ?? getSetting('default_language') ?? 'French';
  const device = params.device ?? 'desktop';
  const depth = Math.min(parseInt(params.depth ?? '10', 10) || 10, 100);

  let results: SerpItem[] = [];
  let error: string | null = null;
  let isFromHistory = false;
  let cost: number | undefined;
  let activeEntry: SerpHistoryEntry | null = null;

  // Load from history
  if (historyId) {
    const saved = getSerpResults<SerpItem>(historyId);
    if (saved) {
      results = saved;
      isFromHistory = true;
      activeEntry = history.find((e) => e.id === historyId) ?? null;
      cost = activeEntry?.cost;
    } else {
      error = 'This search is no longer available.';
    }
  }

  // Fresh search
  if (!historyId && keyword) {
    const dedupeId = stableSearchId(['serp', keyword, location, language, device, depth]);
    const cached = getSerpResults<SerpItem>(dedupeId);

    if (cached) {
      results = cached;
      isFromHistory = true;
      activeEntry = history.find((e) => e.id === dedupeId) ?? null;
      cost = activeEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      try {
        const res = await fetchSerp(keyword, location, language, device, depth, creds.login, creds.pass);
        results = res.items;
        cost = res.cost;
        error = res.error ?? null;
        if (results.length > 0) {
          const hits: TargetHit[] = targetDomains
            .map((td) => {
              const match = results.find((r) => {
                const d = r.domain ?? extractDomain(r.url);
                return d.includes(td) || td.includes(d);
              });
              return match ? { domain: td, position: match.rank_group } : null;
            })
            .filter((h): h is TargetHit => h !== null);

          const entry: SerpHistoryEntry = {
            id: dedupeId,
            ts: Date.now(),
            keyword,
            location,
            language,
            device,
            depth,
            count: results.length,
            cost: res.cost,
            targetHits: hits.length > 0 ? hits : undefined,
          };
          saveSerpSearch(entry, results);
        }
      } catch {
        error = 'Error during the DataForSEO request.';
      }
    }
  }

  const hasQuery = historyId || keyword;

  // Compute which target domains appear in results
  const targetHits: TargetHit[] = targetDomains
    .map((td) => {
      const match = results.find((r) => {
        const d = r.domain ?? extractDomain(r.url);
        return d.includes(td) || td.includes(d);
      });
      return match ? { domain: td, position: match.rank_group } : null;
    })
    .filter((h): h is TargetHit => h !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">SERP Checker</h1>
        <p className="text-sm text-nexo-faint mt-1">Analyzes Google results in real time via DataForSEO.</p>
      </div>

      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="space-y-6">
          {/* Search form */}
          <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analyze" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="nexo-label block mb-1.5">Keyword</label>
                <input
                  type="text" name="keyword" defaultValue={activeEntry?.keyword ?? keyword}
                  placeholder="e.g. plumber paris" required
                  className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all"
                />
              </div>
              <div>
                <label className="nexo-label block mb-1.5">Location</label>
                <LocationPicker name="location" defaultValue={activeEntry?.location ?? location} className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface" />
              </div>
              <div>
                <label className="nexo-label block mb-1.5">Language</label>
                <select name="language" defaultValue={activeEntry?.language ?? language}
                  className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="nexo-label block mb-1.5">Device</label>
                <select name="device" defaultValue={activeEntry?.device ?? device}
                  className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                </select>
              </div>
              <div>
                <label className="nexo-label block mb-1.5">Number of results</label>
                <select name="depth" defaultValue={String(activeEntry?.depth ?? depth)}
                  className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          </SearchForm>

          {/* Target domain hits summary */}
          {hasQuery && !error && targetHits.length > 0 && (
            <div className="bg-nexo-ice/10 border border-nexo-ice/30 rounded-nexo-lg px-5 py-4 flex flex-wrap gap-3">
              <span className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice self-center">Target domains</span>
              {targetHits.map((h) => (
                <div key={h.domain} className="flex items-center gap-1.5 bg-nexo-surface border border-nexo-ice/30 rounded-nexo px-3 py-1.5">
                  <span className="text-xs font-medium text-nexo-ice">{h.domain}</span>
                  <span className="text-[10px] font-medium text-nexo-bg bg-nexo-ice rounded px-1.5 py-0.5">#{h.position}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>
          )}

          {/* Results */}
          {hasQuery && !error && (
            <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="nexo-label">Organic results</h2>
                  {isFromHistory && (
                    <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">History</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
                  <span className="text-xs font-medium text-nexo-faint">{results.length} result{results.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {results.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-nexo-faint">No organic results found.</div>
              ) : (
                <div className="divide-y divide-nexo-border">
                  {results.map((item, i) => {
                    const domain = item.domain ?? extractDomain(item.url);
                    const isTarget = targetDomains.some((td) => domain.includes(td) || td.includes(domain));
                    return (
                      <div key={i} className={`px-6 py-4 hover:bg-white/[0.04] transition-colors ${isTarget ? 'bg-nexo-ice/10 border-l-4 border-nexo-ice/30' : ''}`}>
                        <div className="flex items-start gap-4">
                          <span className={`mt-0.5 w-7 h-7 shrink-0 rounded-nexo text-xs font-medium flex items-center justify-center ${isTarget ? 'bg-nexo-ice text-nexo-bg' : 'bg-nexo-surface-2 text-nexo-dim'}`}>
                            {item.rank_group}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <a href={item.url} target="_blank" rel="noopener noreferrer"
                                className="text-sm font-medium text-nexo-sky hover:underline leading-snug line-clamp-1">
                                {item.title}
                              </a>
                              {isTarget && (
                                <span className="shrink-0 text-[9px] font-medium uppercase tracking-widest text-nexo-ice bg-nexo-ice/10 px-1.5 py-0.5 rounded">target</span>
                              )}
                            </div>
                            <p className="text-[11px] text-nexo-faint mt-0.5 mb-1.5 font-mono truncate">
                              {item.breadcrumb ?? domain}
                            </p>
                            {item.description && (
                              <p className="text-xs text-nexo-dim line-clamp-2 leading-relaxed">{item.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: target domains + history */}
        <div className="space-y-4">
          {/* Target domains */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-4 py-3 border-b border-nexo-border">
              <h2 className="nexo-label">Target domains</h2>
            </div>
            <div className="p-4 space-y-2">
              <form action={addDomainAction} className="flex gap-2">
                <input
                  type="text" name="domain"
                  placeholder="example.com"
                  className="nexo-input min-w-0 flex-1 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-nexo-sky"
                />
                <button type="submit" className="shrink-0 px-3 py-2 bg-white text-nexo-bg text-xs font-medium rounded-nexo hover:bg-nexo-ice transition-colors">
                  +
                </button>
              </form>
              {targetDomains.length === 0 ? (
                <p className="text-[11px] text-nexo-faint px-1">No target domain.</p>
              ) : (
                <div className="space-y-1 pt-1">
                  {targetDomains.map((domain) => (
                    <div key={domain} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-white/[0.02] rounded-nexo">
                      <span className="text-xs font-mono text-nexo-dim truncate">{domain}</span>
                      <form action={removeDomainAction.bind(null, domain)}>
                        <button type="submit" className="shrink-0 text-nexo-faint hover:text-nexo-danger-text transition-colors text-xs font-medium">✕</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-4 py-3 border-b border-nexo-border">
                <h2 className="nexo-label">History</h2>
              </div>
              <div className="divide-y divide-nexo-border">
                {history.map((entry) => {
                  const isActive = entry.id === historyId;
                  return (
                    <a key={entry.id} href={`/dashboard/serp?history_id=${entry.id}#results`}
                      className={`block px-4 py-3 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keyword}</p>
                        <span className="shrink-0 text-[10px] text-nexo-faint">{formatDate(entry.ts)}</span>
                      </div>
                      <p className="text-[10px] text-nexo-faint truncate mt-0.5">{entry.location} · {entry.count} results{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
                      {entry.targetHits && entry.targetHits.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {entry.targetHits.map((h) => (
                            <span key={h.domain} className="inline-flex items-center gap-1 text-[9px] font-medium bg-nexo-ice/10 border border-nexo-ice/30 text-nexo-ice rounded px-1.5 py-0.5">
                              <span className="truncate max-w-[80px]">{h.domain}</span>
                              <span className="bg-nexo-ice text-nexo-bg rounded px-1">#{h.position}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default withProjectScope(SerpPage);
