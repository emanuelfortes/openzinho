import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getRankedKwHistory,
  saveRankedKwSearch,
  getRankedKwResults,
  getSetting,
  type RankedKwSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { LANGUAGES, toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import RankedKeywordsTable from './RankedKeywordsTable';

// ---- Types ----

interface KeywordInfo {
  search_volume?: number;
  cpc?: number;
  competition?: number;
  competition_level?: string;
}

interface KeywordProperties {
  keyword_difficulty?: number;
}

interface SearchIntentInfo {
  main_intent?: string;
}

interface KeywordData {
  keyword?: string;
  keyword_info?: KeywordInfo;
  keyword_properties?: KeywordProperties;
  search_intent_info?: SearchIntentInfo;
}

interface SerpItem {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  url?: string;
  title?: string;
  domain?: string;
  is_featured_snippet?: boolean;
}

interface RankedSerpElement {
  serp_item?: SerpItem;
}

export interface RankedKwItem {
  keyword_data?: KeywordData;
  ranked_serp_element?: RankedSerpElement;
}

interface SearchParams {
  target?: string;
  location?: string;
  language?: string;
  limit?: string;
  order_by?: string;
  max_position?: string;
  history_id?: string;
}

// ---- API ----

async function fetchRankedKeywords(
  target: string,
  location: string,
  language: string,
  limit: number,
  orderBy: string,
  maxPosition: number | null,
  login: string,
  pass: string,
): Promise<{ items: RankedKwItem[]; totalCount: number; cost?: number; error?: string }> {
  const body: Record<string, unknown> = {
    target: target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
    location_name: location,
    language_name: language,
    limit,
    order_by: [orderBy],
  };

  if (maxPosition) {
    body.filters = ['ranked_serp_element.serp_item.rank_group', '<=', maxPosition];
  }

  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: RankedKwItem[] }>(
    'dataforseo_labs/google/ranked_keywords/live', body, { login, pass },
  );
  if (error) return { items: [], totalCount: 0, error };
  return {
    items: result?.items ?? [],
    totalCount: result?.total_count ?? 0,
    cost,
  };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

async function RankedKeywordsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const target = params.target?.trim() ?? '';
  const location = params.location ?? toLabsCountry(getSetting('default_location') || 'Brazil');
  const language = params.language ?? (getSetting('default_language') || 'Portuguese');
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const orderBy = params.order_by ?? 'ranked_serp_element.serp_item.rank_group,asc';
  const maxPosition = params.max_position ? parseInt(params.max_position, 10) : null;

  let items: RankedKwItem[] = [];
  let totalCount = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: RankedKwSearchEntry | null = null;

  if (historyId) {
    const saved = getRankedKwResults<RankedKwItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getRankedKwHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
      totalCount = activeEntry?.totalCount ?? items.length;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  }

  if (!historyId && target) {
    const dedupeId = stableSearchId(['ranked-keywords', target, location, language, limit, orderBy, maxPosition]);
    const cached = getRankedKwResults<RankedKwItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getRankedKwHistory().find((e) => e.id === dedupeId);
      totalCount = cachedEntry?.totalCount ?? items.length;
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const result = await fetchRankedKeywords(target, location, language, limit, orderBy, maxPosition, creds.login, creds.pass);
      items = result.items;
      totalCount = result.totalCount;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const entry: RankedKwSearchEntry = {
          id: dedupeId,
          ts: Date.now(),
          target: target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
          location,
          language,
          count: items.length,
          totalCount,
          cost,
        };
        saveRankedKwSearch(entry, items);
      }
    }
  }

  const history = getRankedKwHistory();
  const hasQuery = historyId || target;

  // Stats
  const top3 = items.filter((i) => (i.ranked_serp_element?.serp_item?.rank_group ?? 999) <= 3).length;
  const top10 = items.filter((i) => (i.ranked_serp_element?.serp_item?.rank_group ?? 999) <= 10).length;
  const top20 = items.filter((i) => (i.ranked_serp_element?.serp_item?.rank_group ?? 999) <= 20).length;
  const avgPosition = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.ranked_serp_element?.serp_item?.rank_group ?? 0), 0) / items.length)
    : null;

  const displayTarget = activeEntry?.target ?? (target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Palavras-chave ranqueadas</h1>
        <p className="text-sm text-nexo-faint mt-1">Palavras-chave em que um domínio ranqueia no Google.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analisar" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Domínio alvo</label>
            <input
              type="text" name="target"
              defaultValue={activeEntry?.target ?? target}
              placeholder="ex.: exemplo.com.br"
              required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono transition-all"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Local</label>
            <LocationPicker name="location" defaultValue={activeEntry?.location ?? location} className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface" scope="labs" />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Idioma</label>
            <select name="language" defaultValue={activeEntry?.language ?? language}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Ordenar por</label>
            <select name="order_by" defaultValue={orderBy}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="ranked_serp_element.serp_item.rank_group,asc">Posição (melhores primeiro)</option>
              <option value="keyword_data.keyword_info.search_volume,desc">Volume de buscas</option>
              <option value="keyword_data.keyword_properties.keyword_difficulty,desc">Dificuldade (maior primeiro)</option>
              <option value="keyword_data.keyword_properties.keyword_difficulty,asc">Dificuldade (menor primeiro)</option>
              <option value="keyword_data.keyword_info.cpc,desc">CPC</option>
            </select>
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Filtro de posição máxima</label>
            <select name="max_position" defaultValue={params.max_position ?? ''}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="">Todas as posições</option>
              <option value="3">Top 3</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
            </select>
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Número de resultados</label>
            <select name="limit" defaultValue={String(limit)}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {/* Stats bar */}
      {hasQuery && !error && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total indexado', value: totalCount.toLocaleString("pt-BR"), sub: `${items.length} exibidas` },
            { label: 'Posição média', value: avgPosition ?? '—', sub: 'dos resultados' },
            { label: 'Top 10', value: top10, sub: `incl. top 3: ${top3}` },
            { label: 'Top 20', value: top20, sub: `posições 11–20: ${top20 - top10}` },
          ].map((stat) => (
            <div key={stat.label} className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
              <p className="nexo-label">{stat.label}</p>
              <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-nexo-faint mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      {hasQuery && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="nexo-label">
                {displayTarget ? <><span className="text-nexo-text">{displayTarget}</span> — palavras-chave ranqueadas</> : 'Palavras-chave ranqueadas'}
              </h2>
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
              <span className="text-xs font-medium text-nexo-faint">{items.length} {items.length === 1 ? 'palavra-chave' : 'palavras-chave'}</span>
              {items.length > 0 && (() => {
                const csvData = items.map((i) => ({
                  keyword: i.keyword_data?.keyword ?? '',
                  position: i.ranked_serp_element?.serp_item?.rank_absolute ?? '',
                  volume: i.keyword_data?.keyword_info?.search_volume ?? '',
                  kd: i.keyword_data?.keyword_properties?.keyword_difficulty ?? '',
                  cpc: i.keyword_data?.keyword_info?.cpc ?? '',
                  url: i.ranked_serp_element?.serp_item?.url ?? '',
                }));
                const csvColumns = [
                  { key: 'keyword', label: 'Palavra-chave' },
                  { key: 'position', label: 'Posição' },
                  { key: 'volume', label: 'Volume' },
                  { key: 'kd', label: 'KD' },
                  { key: 'cpc', label: 'CPC' },
                  { key: 'url', label: 'URL' },
                ];
                return (
                  <div className="flex items-center gap-2">
                    <CopyMarkdownButton data={csvData} columns={csvColumns} />
                    <ExportCSVButton data={csvData} filename={`ranked-keywords-${displayTarget}.csv`} columns={csvColumns} />
                  </div>
                );
              })()}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhuma palavra-chave encontrada.</div>
          ) : (
            <RankedKeywordsTable items={items} />
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Histórico</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/ranked-keywords?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate font-mono ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.location} · {entry.count} exibidas / {entry.totalCount.toLocaleString("pt-BR")} no total
                      {entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
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

export default withProjectScope(RankedKeywordsPage);
