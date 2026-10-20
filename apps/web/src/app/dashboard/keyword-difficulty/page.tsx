import { withProjectScope } from '@/lib/db';
import {
  getCredentials, getSetting,
  getKwDifficultyHistory, saveKwDifficultySearch, getKwDifficultyResults,
  type KwDifficultySearchEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import KeywordDifficultyTable from './KeywordDifficultyTable';

interface DifficultyItem {
  keyword?: string;
  keyword_difficulty?: number;
  avg_backlinks_info?: {
    referring_domains?: number;
    referring_pages?: number;
  };
  serp_info?: {
    se_results_count?: number;
    last_updated_time?: string;
  };
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number;
  };
}

interface SearchParams {
  keywords?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

async function fetchDifficulty(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: DifficultyItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: DifficultyItem[] }>(
    'dataforseo_labs/google/bulk_keyword_difficulty/live',
    { keywords, location_name: location, language_name: language },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: 'numeric', month: 'short', year: 'numeric' });
}

async function KeywordDifficultyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'Brazil');
  const defaultLanguage = getSetting('default_language') ?? 'Portuguese';

  const keywords = params.keywords?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: DifficultyItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: KwDifficultySearchEntry | null = null;

  if (historyId) {
    const saved = getKwDifficultyResults<DifficultyItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getKwDifficultyHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  }

  const hasQuery = historyId || keywords;

  if (!historyId && keywords) {
    const kwList = keywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
    const dedupeId = stableSearchId(['keyword-difficulty', kwList.join(','), location, language]);
    const cachedItems = getKwDifficultyResults<DifficultyItem>(dedupeId);

    if (cachedItems) {
      items = cachedItems;
      cost = getKwDifficultyHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) {
      error = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const result = await fetchDifficulty(kwList, location, language, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const label = kwList.slice(0, 3).join(', ') + (kwList.length > 3 ? '…' : '');
        const entry: KwDifficultySearchEntry = {
          id: dedupeId,
          ts: Date.now(),
          keywords: label,
          location,
          language,
          count: items.length,
          cost,
        };
        saveKwDifficultySearch(entry, items);
      }
    }
  }

  const history = getKwDifficultyHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Dificuldade de palavras-chave</h1>
        <p className="text-sm text-nexo-faint mt-1">Pontuações de dificuldade de palavras-chave em massa via DataForSEO Labs.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analisar" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Palavras-chave <span className="text-nexo-faint font-normal normal-case tracking-normal">(uma por linha, máx. 1000)</span></label>
            <textarea
              name="keywords"
              defaultValue={activeEntry ? '' : keywords}
              rows={6}
              placeholder={"encanador são paulo\nencanador 24 horas\nconserto hidráulico"}
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

      {hasQuery && !error && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="nexo-label">Resultados</h2>
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
              <span className="text-xs font-medium text-nexo-faint">{items.length} {items.length !== 1 ? 'palavras-chave' : 'palavra-chave'}</span>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum resultado encontrado.</div>
          ) : (
            <KeywordDifficultyTable items={items} />
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
                <a key={entry.id} href={`/dashboard/keyword-difficulty?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.count} {entry.count !== 1 ? 'palavras-chave' : 'palavra-chave'}
                      {' · '}{entry.location}
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

export default withProjectScope(KeywordDifficultyPage);
