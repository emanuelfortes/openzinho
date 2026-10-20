import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials,
  getWebMentionsHistory,
  saveWebMentionsSearch,
  getWebMentionsItems,
  getWebMentionsSummary,
  type WebMentionsEntry,
} from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';

// ---- Types ----

const PAGE_TYPES = ['ecommerce', 'news', 'blogs', 'message-boards', 'organization'] as const;
type PageType = typeof PAGE_TYPES[number];

interface SentimentConnotations { anger?: number; happiness?: number; love?: number; sadness?: number; share?: number; fun?: number; }
interface ConnotationTypes { positive?: number; negative?: number; neutral?: number; }

interface MentionItem {
  url?: string;
  domain?: string;
  main_domain?: string;
  country?: string;
  language?: string;
  fetch_time?: string;
  content_info?: {
    title?: string;
    snippet?: string;
    author?: string | null;
    date_published?: string | null;
    sentiment_connotations?: SentimentConnotations;
    connotation_types?: ConnotationTypes;
  };
}

interface SearchResult {
  total_count: number;
  items_count: number;
  items: MentionItem[];
}

interface SummaryResult {
  total_count: number;
  top_domains?: { domain: string; count: number }[];
  sentiment_connotations?: Record<string, number>;
  connotation_types?: Record<string, number>;
  countries?: Record<string, number>;
  languages?: Record<string, number>;
}

interface SearchParams {
  keyword?: string;
  page_type?: string | string[];
  limit?: string;
  history_id?: string;
}

// ---- API ----

function normalizePageTypes(value: string | string[] | undefined): PageType[] {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return arr.filter((v): v is PageType => (PAGE_TYPES as readonly string[]).includes(v));
}

async function fetchWebMentions(
  keyword: string, pageTypes: PageType[], limit: number, login: string, pass: string,
): Promise<{ items?: SearchResult; summary?: SummaryResult; cost?: number; error?: string }> {
  const creds = { login, pass };
  const searchBody: Record<string, unknown> = { keyword, limit };
  const summaryBody: Record<string, unknown> = { keyword, internal_list_limit: 10 };
  if (pageTypes.length > 0) {
    searchBody.page_type = pageTypes;
    summaryBody.page_type = pageTypes;
  }

  const [searchRes, summaryRes] = await Promise.all([
    callDataForSeoFirst<SearchResult>('content_analysis/search/live', searchBody, creds),
    callDataForSeoFirst<SummaryResult>('content_analysis/summary/live', summaryBody, creds),
  ]);

  if (searchRes.error) return { error: searchRes.error };
  if (summaryRes.error) return { error: summaryRes.error };

  return {
    items: searchRes.result,
    summary: summaryRes.result,
    cost: (searchRes.cost ?? 0) + (summaryRes.cost ?? 0),
  };
}

// ---- UI helpers ----

function fmt(n?: number) { return n != null ? n.toLocaleString('pt-BR') : '—'; }

function formatDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dominantSentiment(c?: ConnotationTypes): 'positive' | 'negative' | 'neutral' | null {
  if (!c) return null;
  const entries: Array<['positive' | 'negative' | 'neutral', number]> = [
    ['positive', c.positive ?? 0], ['negative', c.negative ?? 0], ['neutral', c.neutral ?? 0],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : null;
}

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  ecommerce: 'e-commerce', news: 'notícias', blogs: 'blogs', 'message-boards': 'fóruns', organization: 'organizações',
};

const KEY_LABELS: Record<string, string> = {
  positive: 'positivo', negative: 'negativo', neutral: 'neutro',
  anger: 'raiva', happiness: 'alegria', love: 'amor', sadness: 'tristeza', share: 'compartilhamento', fun: 'diversão',
};

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30',
  negative: 'text-nexo-danger-text bg-nexo-danger/10 border-nexo-danger/40',
  neutral: 'text-nexo-dim bg-white/[0.02] border-nexo-border',
};

function SentimentBadge({ connotations }: { connotations?: ConnotationTypes }) {
  const dom = dominantSentiment(connotations);
  if (!dom) return null;
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md border ${SENTIMENT_STYLE[dom]}`}>
      {KEY_LABELS[dom] ?? dom}
    </span>
  );
}

function DistributionBars({ title, data, total }: { title: string; data?: Record<string, number>; total: number }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
      <h2 className="nexo-label mb-4">{title}</h2>
      <div className="space-y-2">
        {entries.slice(0, 8).map(([key, value]) => {
          const pct = Math.round((value / max) * 100);
          const share = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-xs font-medium text-nexo-dim truncate capitalize">{KEY_LABELS[key] ?? key}</span>
                <span className="text-xs font-mono text-nexo-dim shrink-0">{fmt(value)} ({share}%)</span>
              </div>
              <div className="h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                <div className="h-full bg-nexo-sky/40 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ---- Page ----

async function WebMentionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const keyword = (params.keyword ?? '').trim();
  const pageTypes = normalizePageTypes(params.page_type);
  const limit = Math.min(Math.max(parseInt(params.limit ?? '20', 10) || 20, 1), 100);

  let searchResult: SearchResult | null = null;
  let summaryResult: SummaryResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: WebMentionsEntry | null = null;

  if (historyId) {
    searchResult = getWebMentionsItems<SearchResult>(historyId);
    summaryResult = getWebMentionsSummary<SummaryResult>(historyId);
    if (searchResult && summaryResult) {
      isFromHistory = true;
      activeEntry = getWebMentionsHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  } else if (keyword) {
    if (!creds) {
      error = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const dedupeId = stableSearchId(['web-mentions', keyword, pageTypes.join(','), limit]);
      const cachedItems = getWebMentionsItems<SearchResult>(dedupeId);
      const cachedSummary = getWebMentionsSummary<SummaryResult>(dedupeId);

      if (cachedItems && cachedSummary) {
        searchResult = cachedItems;
        summaryResult = cachedSummary;
        cost = getWebMentionsHistory().find((e) => e.id === dedupeId)?.cost;
      } else {
        const res = await fetchWebMentions(keyword, pageTypes, limit, creds.login, creds.pass);
        error = res.error ?? null;
        cost = res.cost;

        if (!error && res.items && res.summary) {
          searchResult = res.items;
          summaryResult = res.summary;

          const entry: WebMentionsEntry = {
            id: dedupeId, ts: Date.now(), keyword, pageTypes: pageTypes.join(','), limit,
            totalCount: res.items.total_count, cost,
          };
          saveWebMentionsSearch(entry, res.items, res.summary);
        }
      }
    }
  }

  const history = getWebMentionsHistory();
  const hasQuery = !!(historyId || keyword);
  const displayKeyword = activeEntry?.keyword ?? keyword;
  const items = searchResult?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Menções na web</h1>
        <p className="text-sm text-nexo-faint mt-1">Sentimento sobre a marca na web: menções, divisão de sentimento e distribuição por país e domínio via DataForSEO Content Analysis.</p>
      </div>

      <SearchForm
        className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
        btnLabel="Analisar"
        btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-sky transition-colors"
        loadingLabel="Varrendo a web…"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="nexo-label block mb-1.5">Palavra-chave ou marca</label>
            <input
              name="keyword"
              type="text"
              defaultValue={displayKeyword}
              placeholder="nome da sua marca"
              required
              className="nexo-input min-w-0 w-full h-[42px] px-4 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Limite de resultados</label>
            <select name="limit" defaultValue={String(limit)}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Tipos de página</label>
            <div className="flex flex-wrap gap-3">
              {PAGE_TYPES.map((pt) => (
                <label key={pt} className="flex items-center gap-1.5 text-xs font-medium text-nexo-dim">
                  <input type="checkbox" name="page_type" value={pt} defaultChecked={pageTypes.includes(pt)}
                    className="rounded border-nexo-border text-nexo-sky focus:ring-nexo-sky" />
                  {PAGE_TYPE_LABELS[pt]}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-nexo-faint mt-1">Deixe tudo desmarcado para buscar em todos os tipos de página.</p>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {hasQuery && !error && searchResult && summaryResult && (
        <div id="results" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="nexo-label">Palavra-chave</span>
            <span className="font-mono font-medium text-nexo-text">{displayKeyword}</span>
            {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint ml-auto">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
          </div>

          {summaryResult.total_count === 0 ? (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center text-sm text-nexo-faint">
              Nenhuma menção na web encontrada para esta palavra-chave.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                  <p className="nexo-label">Total de menções</p>
                  <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{fmt(summaryResult.total_count)}</p>
                </div>
                <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                  <p className="nexo-label">Parcela positiva</p>
                  <p className="nexo-metric font-mono text-2xl text-nexo-ice mt-1 tabular-nums">
                    {summaryResult.total_count > 0 ? Math.round(((summaryResult.connotation_types?.positive ?? 0) / summaryResult.total_count) * 100) : 0}%
                  </p>
                </div>
                <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                  <p className="nexo-label">Parcela negativa</p>
                  <p className="nexo-metric font-mono text-2xl text-nexo-danger-text mt-1 tabular-nums">
                    {summaryResult.total_count > 0 ? Math.round(((summaryResult.connotation_types?.negative ?? 0) / summaryResult.total_count) * 100) : 0}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DistributionBars title="Polaridade do sentimento" data={summaryResult.connotation_types} total={summaryResult.total_count} />
                <DistributionBars title="Reações emocionais" data={summaryResult.sentiment_connotations} total={summaryResult.total_count} />
                <DistributionBars title="Principais domínios" data={Object.fromEntries((summaryResult.top_domains ?? []).map((d) => [d.domain, d.count]))} total={summaryResult.total_count} />
                <DistributionBars title="Países" data={summaryResult.countries} total={summaryResult.total_count} />
              </div>

              <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
                <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
                  <h2 className="nexo-label">Menções</h2>
                  <span className="text-xs font-medium text-nexo-faint">{items.length} {items.length === 1 ? 'exibida' : 'exibidas'}</span>
                </div>
                {items.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhuma menção individual retornada.</div>
                ) : (
                  <div className="divide-y divide-nexo-border">
                    {items.map((item, i) => (
                      <div key={i} className="px-6 py-5 hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <SentimentBadge connotations={item.content_info?.connotation_types} />
                            {item.domain && (
                              <span className="text-[11px] font-mono text-nexo-dim">{item.domain}</span>
                            )}
                            {item.country && (
                              <span className="text-[10px] text-nexo-faint bg-nexo-surface-2 px-1.5 py-0.5 rounded">{item.country}</span>
                            )}
                          </div>
                          {(item.content_info?.date_published || item.fetch_time) && (
                            <span className="shrink-0 text-[11px] text-nexo-faint">
                              {formatDate(item.content_info?.date_published ?? item.fetch_time)}
                            </span>
                          )}
                        </div>

                        {item.content_info?.title && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-semibold text-nexo-text hover:text-nexo-sky mb-1 block">
                            {item.content_info.title}
                          </a>
                        )}
                        {item.content_info?.snippet && (
                          <p className="text-sm text-nexo-dim leading-relaxed">
                            {truncate(item.content_info.snippet, 300)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Histórico</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/web-mentions?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keyword}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {fmt(entry.totalCount)} {entry.totalCount === 1 ? 'menção' : 'menções'}
                      {entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-nexo-faint">{formatDate(new Date(entry.ts).toISOString())}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(WebMentionsPage);
