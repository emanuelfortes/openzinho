import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getFanOutHistory, saveFanOutSearch, getFanOutResults, getFanOutSeedSummary,
  type FanOutEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import HistorySidebar from '@/components/HistorySidebar';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import FanOutQueryTable from './FanOutQueryTable';
import FanOutTargetingFields from './FanOutTargetingFields';

// ---- Types ----

const MAX_SEEDS = 20;

interface MonthlyAiSearch {
  year: number;
  month: number;
  ai_search_volume: number;
}

interface MentionItem {
  question?: string;
  // The API returns these as plain strings, not { keyword } objects.
  fan_out_queries?: string[];
}

interface FanOutQueryItem {
  keyword: string;
  ai_search_volume?: number;
  ai_monthly_searches?: MonthlyAiSearch[];
  seeds: string[];
  mentions: number;
}

interface SeedStat {
  seed: string;
  mentions: number;
  fanOutQueries: number;
  error?: string;
}

interface AiKeywordVolumeItem {
  keyword?: string;
  ai_search_volume?: number;
  ai_monthly_searches?: MonthlyAiSearch[];
}

interface SearchParams {
  seeds?: string;
  platform?: string;
  location?: string;
  language?: string;
  limit?: string;
  history_id?: string;
}

// ---- API ----

/** One request per seed keyword (the live endpoint rejects more than one task per POST body —
 * "You can set only one task at a time"), fired in parallel. Each is scoped to fan_out_queries
 * so a match is a fan-out query DataForSEO generated when answering some unrelated prompt — not
 * a mention of the seed itself. */
async function fetchFanOutMentions(
  seeds: string[],
  platform: string,
  location: string,
  language: string,
  limit: number,
  login: string,
  pass: string,
): Promise<{ perSeed: Array<{ seed: string; items: MentionItem[]; error?: string }>; totalCost: number }> {
  const creds = { login, pass };

  const perSeed = await Promise.all(seeds.map(async (seed) => {
    const targetObj = { keyword: seed, search_filter: 'include', search_scope: ['fan_out_queries'], match_type: 'word_match' };
    const body: Record<string, unknown> = { target: [targetObj], platform, limit };
    // ChatGPT isn't geo/language-targeted like Google AI is — the API rejects location_name/
    // language_name outright when platform is chat_gpt, so only send them for google.
    if (platform === 'google') {
      body.location_name = location;
      body.language_name = language;
    }

    const { result, cost, error } = await callDataForSeoFirst<{ items?: MentionItem[] }>(
      'ai_optimization/llm_mentions/search/live', body, creds,
    );
    if (error) return { seed, items: [] as MentionItem[], error, cost: 0 };
    return { seed, items: result?.items ?? [], cost: cost ?? 0 };
  }));

  const totalCost = perSeed.reduce((s, r) => s + r.cost, 0);
  return { perSeed, totalCost };
}

async function fetchAiKeywordVolume(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: AiKeywordVolumeItem[]; cost?: number; error?: string }> {
  if (keywords.length === 0) return { items: [] };
  const { result, cost, error } = await callDataForSeoFirst<{ items?: AiKeywordVolumeItem[] }>(
    'ai_optimization/ai_keyword_data/keywords_search_volume/live',
    { keywords, location_name: location, language_name: language },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

/** Runs both stages: discover fan-out queries per seed, then enrich the deduped set with AI search volume. */
async function runFanOut(
  seeds: string[],
  platform: string,
  location: string,
  language: string,
  limit: number,
  login: string,
  pass: string,
): Promise<{ items: FanOutQueryItem[]; seedStats: SeedStat[]; cost: number; error?: string }> {
  const { perSeed, totalCost: mentionsCost } = await fetchFanOutMentions(seeds, platform, location, language, limit, login, pass);

  const queryMap = new Map<string, FanOutQueryItem>();
  const seedStats: SeedStat[] = [];

  for (const { seed, items, error } of perSeed) {
    let fanOutCount = 0;
    for (const item of items) {
      for (const fq of item.fan_out_queries ?? []) {
        const keyword = fq?.trim();
        if (!keyword) continue;
        fanOutCount++;
        const key = keyword.toLowerCase();
        const existing = queryMap.get(key);
        if (existing) {
          if (!existing.seeds.includes(seed)) existing.seeds.push(seed);
          existing.mentions++;
        } else {
          queryMap.set(key, { keyword, seeds: [seed], mentions: 1 });
        }
      }
    }
    seedStats.push({ seed, mentions: items.length, fanOutQueries: fanOutCount, error });
  }

  // Most-surfaced queries first, so a truncation at 1000 (the AI Keyword Data endpoint's cap) drops the least relevant.
  const discovered = [...queryMap.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 1000);

  if (discovered.length === 0) {
    return { items: [], seedStats, cost: mentionsCost };
  }

  const volumeRes = await fetchAiKeywordVolume(discovered.map((d) => d.keyword), location, language, login, pass);
  if (volumeRes.error) {
    return { items: discovered, seedStats, cost: mentionsCost, error: volumeRes.error };
  }

  const volumeByKeyword = new Map(volumeRes.items.map((v) => [v.keyword?.toLowerCase() ?? '', v]));
  const merged = discovered.map((d) => {
    const v = volumeByKeyword.get(d.keyword.toLowerCase());
    return { ...d, ai_search_volume: v?.ai_search_volume, ai_monthly_searches: v?.ai_monthly_searches };
  });

  return { items: merged, seedStats, cost: mentionsCost + (volumeRes.cost ?? 0) };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

async function QueryFanOutPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') || 'Brazil');
  const defaultLanguage = getSetting('default_language') || 'Portuguese';

  const seedsRaw = params.seeds?.trim() ?? '';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'google';
  // Per DataForSEO's docs, ChatGPT mentions are available for United States / English only — force
  // both rather than letting the picker desync the AI-volume lookup from the market the fan-out
  // queries actually came from (and so identical ChatGPT searches share one cache entry regardless
  // of what location/language happened to be selected).
  const location = platform === 'chat_gpt' ? 'United States' : (params.location ?? defaultLocation);
  const language = platform === 'chat_gpt' ? 'English' : (params.language ?? defaultLanguage);
  const limit = Math.min(Math.max(parseInt(params.limit ?? '20', 10) || 20, 1), 100);

  let items: FanOutQueryItem[] = [];
  let seedStats: SeedStat[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: FanOutEntry | null = null;

  if (historyId) {
    const saved = getFanOutResults<FanOutQueryItem>(historyId);
    const savedStats = getFanOutSeedSummary<SeedStat>(historyId);
    if (saved) {
      items = saved;
      seedStats = savedStats ?? [];
      isFromHistory = true;
      activeEntry = getFanOutHistory().find((e) => e.id === historyId) ?? null;
      cost = activeEntry?.cost;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  }

  const hasQuery = !!(historyId || seedsRaw);

  if (!historyId && seedsRaw) {
    const seeds = [...new Set(seedsRaw.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SEEDS);
    const dedupeId = stableSearchId(['query-fan-out', seeds.join('\n'), platform, location, language, limit]);
    const cachedItems = getFanOutResults<FanOutQueryItem>(dedupeId);
    const cachedStats = getFanOutSeedSummary<SeedStat>(dedupeId);

    if (cachedItems) {
      items = cachedItems;
      seedStats = cachedStats ?? [];
      const cachedEntry = getFanOutHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const result = await runFanOut(seeds, platform, location, language, limit, creds.login, creds.pass);
      items = result.items;
      seedStats = result.seedStats;
      cost = result.cost;
      error = result.error ?? null;

      const label = seeds.slice(0, 3).join(', ') + (seeds.length > 3 ? '…' : '');
      const entry: FanOutEntry = {
        id: dedupeId,
        ts: Date.now(),
        seeds: label,
        platform,
        location,
        language,
        seedCount: seeds.length,
        queryCount: items.length,
        cost,
      };
      saveFanOutSearch(entry, items, seedStats);
    }
  }

  const history = getFanOutHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const displayPlatform = activeEntry?.platform ?? platform;
  const totalVolume = items.reduce((s, i) => s + (i.ai_search_volume ?? 0), 0);
  const seedsTriggered = seedStats.filter((s) => s.fanOutQueries > 0).length;
  const triggerRate = seedStats.length > 0 ? Math.round((seedsTriggered / seedStats.length) * 100) : null;

  const historyItems = history.map((entry) => {
    const isActive = entry.id === historyId;
    return (
      <a key={entry.id} href={`/dashboard/query-fan-out?history_id=${entry.id}#results`}
        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.seeds}</p>
          <p className="text-[11px] text-nexo-faint mt-0.5">
            {entry.seedCount} {entry.seedCount === 1 ? 'semente' : 'sementes'} → {entry.queryCount} {entry.queryCount === 1 ? 'consulta' : 'consultas'}
            {' · '}{entry.location}
            {entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-nexo-faint">{formatDate(entry.ts)}</span>
      </a>
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Query Fan-Out</h1>
        <p className="text-sm text-nexo-faint mt-1">
          Descubra as subconsultas ocultas que os modelos de IA geram ao responder prompts relacionados às suas palavras-chave semente, e o volume de buscas em IA delas.
        </p>
      </div>

      {!creds && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text text-sm rounded-nexo-lg px-4 py-3">
          Credenciais da DataForSEO ausentes. Configure-as em{' '}
          <a href="/dashboard/settings" className="underline font-semibold">Configurações</a>.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <SearchForm
            className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
            btnLabel="Analisar"
            btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-sky transition-colors"
            loadingLabel="Buscando consultas de fan-out…"
            disabled={!creds}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="nexo-label block mb-1.5">
                  Palavras-chave semente <span className="text-nexo-faint font-normal normal-case tracking-normal">(uma por linha, máx. {MAX_SEEDS} — cada semente é uma consulta cobrada à parte)</span>
                </label>
                <textarea
                  name="seeds"
                  defaultValue={activeEntry ? '' : seedsRaw}
                  rows={5}
                  placeholder={'encanador\ndesentupimento\nvazamento'}
                  required
                  className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all font-mono resize-y"
                />
              </div>

              <FanOutTargetingFields
                defaultPlatform={displayPlatform}
                defaultLimit={String(limit)}
                defaultLocation={displayLocation}
                defaultLanguage={displayLanguage}
              />
            </div>
          </SearchForm>

          {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

          {hasQuery && !error && seedStats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                <p className="nexo-label">Sementes analisadas</p>
                <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{seedStats.length}</p>
              </div>
              <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                <p className="nexo-label">Geraram fan-out</p>
                <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">
                  {seedsTriggered}{triggerRate !== null && <span className="text-sm text-nexo-faint font-semibold"> ({triggerRate}%)</span>}
                </p>
              </div>
              <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                <p className="nexo-label">Consultas de fan-out encontradas</p>
                <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{items.length}</p>
              </div>
              <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                <p className="nexo-label">Volume total em IA</p>
                <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{totalVolume.toLocaleString('pt-BR')}</p>
              </div>
            </div>
          )}

          {hasQuery && !error && seedStats.some((s) => s.error) && (
            <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text text-xs rounded-nexo-lg px-4 py-3 space-y-1">
              {seedStats.filter((s) => s.error).map((s) => (
                <p key={s.seed}><span className="font-semibold">{s.seed}</span> — {s.error}</p>
              ))}
            </div>
          )}

          {hasQuery && !error && (
            <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="nexo-label">Consultas de fan-out descobertas</h2>
                  {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
                </div>
                <div className="flex items-center gap-3">
                  {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
                  <span className="text-xs font-medium text-nexo-faint">{items.length} {items.length === 1 ? 'consulta' : 'consultas'}</span>
                  {items.length > 0 && (
                    <CopyMarkdownButton
                      data={items.map((i) => ({
                        keyword: i.keyword,
                        ai_search_volume: i.ai_search_volume ?? '',
                        mentions: i.mentions,
                        seeds: i.seeds.join(', '),
                      }))}
                      columns={[
                        { key: 'keyword', label: 'Consulta de fan-out' },
                        { key: 'ai_search_volume', label: 'Volume em IA' },
                        { key: 'mentions', label: 'Menções' },
                        { key: 'seeds', label: 'Da(s) semente(s)' },
                      ]}
                    />
                  )}
                </div>
              </div>
              {items.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-nexo-faint space-y-1">
                  <p>Nenhuma consulta de fan-out apareceu para essas sementes nas menções verificadas.</p>
                  <p className="text-xs text-nexo-faint">Em geral, só cerca de 47,5% dos prompts do ChatGPT geram fan-out — tente aumentar &quot;menções verificadas por semente&quot; ou ampliar as palavras-chave semente.</p>
                </div>
              ) : (
                <FanOutQueryTable items={items} />
              )}
            </div>
          )}

          {!hasQuery && !error && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-16 text-center space-y-2">
              <p className="text-nexo-faint text-sm">Digite palavras-chave semente acima para descobrir as subconsultas que os modelos de IA geram e com que frequência as pessoas as buscam.</p>
              <p className="text-nexo-faint text-xs max-w-lg mx-auto">
                Quando um modelo de IA não consegue responder totalmente a um prompt com o que já sabe, ele faz buscas extras em silêncio — as &quot;consultas de fan-out&quot; — para reunir contexto antes de responder.
                Elas nunca chegam ao usuário, mas definem quais fontes são citadas. Esta ferramenta pede à API LLM Mentions da DataForSEO as consultas de fan-out que correspondem às suas sementes e depois busca o volume de buscas em IA delas.
              </p>
              <p className="text-nexo-faint text-xs">Dados das APIs DataForSEO LLM Mentions Search e AI Keyword Data.</p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <HistorySidebar title="Histórico" items={historyItems} />
        )}
      </div>
    </div>
  );
}

export default withProjectScope(QueryFanOutPage);
