import { withProjectScope } from '@/lib/db';
import {
  getCredentials, getSetting,
  getRelatedKwHistory, saveRelatedKwSearch, getRelatedKwResults,
  type RelatedKwSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import RelatedKeywordsTable from './RelatedKeywordsTable';

interface RelatedKeywordItem {
  keyword_data?: {
    keyword?: string;
    search_volume?: number;
    cpc?: number;
    competition?: number;
    competition_index?: number;
    monthly_searches?: { year: number; month: number; search_volume: number }[];
  };
  related_keywords?: string[];
  keyword_difficulty?: number;
  avg_backlinks_info?: {
    referring_domains?: number;
  };
}

interface SearchParams {
  keyword?: string;
  location?: string;
  language?: string;
  depth?: string;
  limit?: string;
  history_id?: string;
}

async function fetchRelatedKeywords(
  keyword: string,
  location: string,
  language: string,
  depth: number,
  limit: number,
  login: string,
  pass: string,
): Promise<{ items: RelatedKeywordItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: RelatedKeywordItem[] }>(
    'dataforseo_labs/google/related_keywords/live',
    { keyword, location_name: location, language_name: language, depth, limit, include_serp_info: true, include_clickstream_data: false },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: 'numeric', month: 'short', year: 'numeric' });
}

async function RelatedKeywordsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'Brazil');
  const defaultLanguage = getSetting('default_language') ?? 'Portuguese';

  const keyword = params.keyword?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const depth = Math.min(Math.max(parseInt(params.depth ?? '1', 10) || 1, 1), 4);
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);

  let items: RelatedKeywordItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: RelatedKwSearchEntry | null = null;

  if (historyId) {
    const saved = getRelatedKwResults<RelatedKeywordItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getRelatedKwHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  }

  const hasQuery = historyId || keyword;

  if (!historyId && keyword) {
    const dedupeId = stableSearchId(['related-keywords', keyword, location, language, depth, limit]);
    const cached = getRelatedKwResults<RelatedKeywordItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getRelatedKwHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const result = await fetchRelatedKeywords(keyword, location, language, depth, limit, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const entry: RelatedKwSearchEntry = {
          id: dedupeId,
          ts: Date.now(),
          keyword,
          location,
          language,
          depth,
          count: items.length,
          cost,
        };
        saveRelatedKwSearch(entry, items);
      }
    }
  }

  const history = getRelatedKwHistory();
  const displayKeyword = activeEntry?.keyword ?? keyword;
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const displayDepth = activeEntry?.depth ?? depth;

  const csvData = items.map((item) => ({
    keyword: item.keyword_data?.keyword ?? '',
    search_volume: item.keyword_data?.search_volume ?? '',
    difficulty: item.keyword_difficulty ?? '',
    cpc: item.keyword_data?.cpc != null ? item.keyword_data.cpc.toFixed(2) : '',
    competition_index: item.keyword_data?.competition_index ?? '',
    ref_domains: item.avg_backlinks_info?.referring_domains ?? '',
    related_count: item.related_keywords?.length ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Palavras-chave relacionadas</h1>
        <p className="text-sm text-nexo-faint mt-1">Palavras-chave relacionadas a uma palavra-chave de origem via DataForSEO Labs.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Buscar" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Palavra-chave de origem</label>
            <input
              type="text" name="keyword"
              defaultValue={displayKeyword}
              placeholder="ex.: encanador"
              required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all"
            />
          </div>
          <LabsLocationLanguageFields
            defaultLocation={displayLocation}
            defaultLanguage={displayLanguage}
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
          <div>
            <label className="nexo-label block mb-1.5">Profundidade</label>
            <select name="depth" defaultValue={String(displayDepth)}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="1">1 — Direta</option>
              <option value="2">2 — Estendida</option>
              <option value="3">3 — Ampla</option>
              <option value="4">4 — Exaustiva</option>
            </select>
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Máx. de resultados</label>
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

      {hasQuery && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="nexo-label">Resultados</h2>
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
              <span className="text-xs font-medium text-nexo-faint">{items.length} {items.length !== 1 ? 'resultados' : 'resultado'}</span>
              {items.length > 0 && (() => {
                const csvColumns = [
                  { key: 'keyword', label: 'Palavra-chave' },
                  { key: 'search_volume', label: 'Volume de buscas' },
                  { key: 'difficulty', label: 'Dificuldade' },
                  { key: 'cpc', label: 'CPC' },
                  { key: 'competition_index', label: 'Índice de concorrência' },
                  { key: 'ref_domains', label: 'Média de domínios de referência' },
                  { key: 'related_count', label: 'Qtd. relacionadas' },
                ];
                return (
                  <div className="flex items-center gap-2">
                    <CopyMarkdownButton data={csvData} columns={csvColumns} />
                    <ExportCSVButton data={csvData} filename={`related-keywords-${displayKeyword}.csv`} columns={csvColumns} />
                  </div>
                );
              })()}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum resultado encontrado.</div>
          ) : (
            <RelatedKeywordsTable items={items} />
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
                <a key={entry.id} href={`/dashboard/related-keywords?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keyword}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.count} {entry.count !== 1 ? 'resultados' : 'resultado'}
                      {' · '}{entry.location} · profundidade {entry.depth}
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

export default withProjectScope(RelatedKeywordsPage);
