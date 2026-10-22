import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getAiOptimizationHistory, saveAiOptimizationSearch, getAiOptimizationResults,
  type AiOptimizationEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import AiOptimizationTargetingFields from './AiOptimizationTargetingFields';

// ---- Types ----

interface Source {
  url?: string;
  domain?: string;
  title?: string;
}

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface MentionItem {
  platform?: string;
  model_name?: string;
  question?: string;
  answer?: string;
  sources?: Source[];
  ai_search_volume?: number;
  monthly_searches?: MonthlySearch[];
  brand_entities?: Array<{ title?: string; category?: string }>;
  // The API returns these as plain strings, not { keyword } objects.
  fan_out_queries?: string[];
  first_response_at?: string;
  last_response_at?: string;
}

interface SearchParams {
  target?: string;
  target_type?: string;
  platform?: string;
  location?: string;
  language?: string;
  limit?: string;
  history_id?: string;
}

// ---- API ----

async function fetchLlmMentions(
  targetValue: string,
  targetType: 'keyword' | 'domain',
  platform: string,
  location: string,
  language: string,
  limit: number,
  login: string,
  pass: string,
): Promise<{ items: MentionItem[]; cost?: number; error?: string }> {
  const targetObj =
    targetType === 'domain'
      ? { domain: targetValue, search_filter: 'include', search_scope: ['any'] }
      : { keyword: targetValue, search_filter: 'include', search_scope: ['any'], match_type: 'word_match' };

  // ChatGPT isn't geo/language-targeted like Google AI is — the API rejects location_name/
  // language_name outright ("Invalid Field") when platform is chat_gpt, so only send them for google.
  const body: Record<string, unknown> = { target: [targetObj], platform, limit };
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }

  const { result, cost, error } = await callDataForSeoFirst<{ items?: MentionItem[] }>(
    'ai_optimization/llm_mentions/search/live', body, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

// ---- UI helpers ----

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google AI',
  chat_gpt: 'ChatGPT',
};

const MODEL_COLORS: Record<string, string> = {
  google_ai_overview: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
  gpt_4o: 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30',
  gpt_4o_mini: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
  gpt_4_turbo: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
  gemini: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
};

function ModelBadge({ model }: { model?: string }) {
  if (!model) return null;
  const label = model.replace(/_/g, ' ');
  const color = MODEL_COLORS[model] ?? 'text-nexo-dim bg-white/[0.02] border-nexo-border';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium border uppercase tracking-wider ${color}`}>
      {label}
    </span>
  );
}

function Sparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  const data = (monthly ?? []).slice(-12);
  if (data.length === 0) return null;
  const max = Math.max(...data.map((m) => m.search_volume ?? 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-5 mt-1"
      title={data.map((m) => `${m.month}/${m.year}: ${m.search_volume?.toLocaleString('pt-BR')}`).join(' · ')}>
      {data.map((m, i) => (
        <div
          key={i}
          className="w-1.5 bg-nexo-sky/40 rounded-sm"
          style={{ height: `${Math.max(2, Math.round(((m.search_volume ?? 0) / max) * 20))}px` }}
        />
      ))}
    </div>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

async function AiOptimizationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') || 'Brazil');
  const defaultLanguage = getSetting('default_language') || 'Portuguese';

  const targetValue = (params.target ?? '').trim();
  const targetType = (params.target_type === 'domain' ? 'domain' : 'keyword') as 'keyword' | 'domain';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'google';
  // Per DataForSEO's docs, ChatGPT mentions are available for United States / English only.
  const location = platform === 'chat_gpt' ? 'United States' : (params.location ?? defaultLocation);
  const language = platform === 'chat_gpt' ? 'English' : (params.language ?? defaultLanguage);
  const limit = Math.min(Math.max(parseInt(params.limit ?? '20', 10) || 20, 1), 100);

  let items: MentionItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: AiOptimizationEntry | null = null;

  if (historyId) {
    const cached = getAiOptimizationResults<MentionItem>(historyId);
    if (cached) {
      items = cached;
      isFromHistory = true;
      activeEntry = getAiOptimizationHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  } else if (targetValue) {
    if (!creds) {
      error = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const dedupeId = stableSearchId(['ai-optimization', targetValue, targetType, platform, location, language, limit]);
      const cached = getAiOptimizationResults<MentionItem>(dedupeId);

      if (cached) {
        items = cached;
        cost = getAiOptimizationHistory().find((e) => e.id === dedupeId)?.cost;
      } else {
        const res = await fetchLlmMentions(targetValue, targetType, platform, location, language, limit, creds.login, creds.pass);
        items = res.items;
        cost = res.cost;
        error = res.error ?? null;

        if (!error) {
          const entry: AiOptimizationEntry = {
            id: dedupeId, ts: Date.now(), target: targetValue, targetType, platform, location, language, limit, cost,
          };
          saveAiOptimizationSearch(entry, items);
        }
      }
    }
  }

  const history = getAiOptimizationHistory();
  const displayTarget = activeEntry?.target ?? targetValue;
  const hasQuery = !!(historyId || targetValue);
  const totalVolume = items.reduce((s, i) => s + (i.ai_search_volume ?? 0), 0);
  const uniqueModels = [...new Set(items.map((i) => i.model_name).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Otimização para IA</h1>
        <p className="text-sm text-nexo-faint mt-1">Acompanhe como os modelos de IA mencionam sua palavra-chave ou domínio via DataForSEO LLM Mentions.</p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
        btnLabel="Analisar"
        btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-sky transition-colors"
        loadingLabel="Buscando menções em IA…"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Target type + input */}
          <div className="sm:col-span-2 flex gap-2">
            <div className="shrink-0">
              <label className="nexo-label block mb-1.5">Tipo</label>
              <select name="target_type" defaultValue={targetType}
                className="nexo-input min-w-0 w-full h-[42px] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
                <option value="keyword">Palavra-chave</option>
                <option value="domain">Domínio</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="nexo-label block mb-1.5">Alvo</label>
              <input
                name="target"
                type="text"
                defaultValue={displayTarget}
                placeholder={targetType === 'domain' ? 'exemplo.com.br' : 'encanador são paulo'}
                className="nexo-input min-w-0 w-full h-[42px] px-4 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              />
            </div>
          </div>

          <AiOptimizationTargetingFields
            defaultPlatform={platform}
            defaultLimit={String(limit)}
            defaultLocation={location}
            defaultLanguage={language}
          />
        </div>
      </SearchForm>

      {error && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>
      )}

      {/* Summary stats */}
      {hasQuery && !error && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
            <p className="nexo-label">Menções encontradas</p>
            <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{items.length}</p>
          </div>
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
            <p className="nexo-label">Volume total em IA</p>
            <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{totalVolume.toLocaleString('pt-BR')}</p>
          </div>
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
            <p className="nexo-label">Modelos</p>
            <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{uniqueModels.length}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {hasQuery && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <h2 className="nexo-label">
              Menções em IA — {PLATFORM_LABELS[platform] ?? platform}
            </h2>
            <div className="flex items-center gap-3">
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
              {cost !== undefined && (
                <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>
              )}
              <span className="text-xs font-medium text-nexo-faint">{items.length} {items.length === 1 ? 'resultado' : 'resultados'}</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">
              Nenhuma menção em IA encontrada para este alvo.
            </div>
          ) : (
            <div className="divide-y divide-nexo-border">
              {items.map((item, i) => (
                <div key={i} className="px-6 py-5 hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ModelBadge model={item.model_name} />
                      {item.ai_search_volume != null && (
                        <span className="nexo-section bg-nexo-blue/10 border border-nexo-border-strong px-2 py-0.5 rounded-md">
                          {item.ai_search_volume.toLocaleString('pt-BR')} vol. IA
                        </span>
                      )}
                    </div>
                    {(item.first_response_at || item.last_response_at) && (
                      <span className="shrink-0 text-[11px] text-nexo-faint">
                        {formatDate(item.last_response_at ?? item.first_response_at)}
                      </span>
                    )}
                  </div>

                  {/* Question */}
                  {item.question && (
                    <p className="text-sm font-semibold text-nexo-text mb-2">{item.question}</p>
                  )}

                  {/* Answer */}
                  {item.answer && (
                    <p className="text-sm text-nexo-dim leading-relaxed mb-3">
                      {truncate(item.answer.replace(/#+\s/g, '').replace(/\*\*/g, ''), 400)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {/* Sources */}
                    {(item.sources?.length ?? 0) > 0 && (
                      <div>
                        <p className="nexo-label mb-1">Fontes</p>
                        <div className="flex flex-wrap gap-1">
                          {item.sources!.slice(0, 5).map((s, si) => (
                            <a
                              key={si}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={s.title ?? s.url}
                              className="text-[11px] text-nexo-sky bg-nexo-blue/10 border border-nexo-border-strong px-2 py-0.5 rounded-md hover:bg-nexo-blue/15 transition-colors max-w-[160px] truncate"
                            >
                              {s.domain ?? s.url}
                            </a>
                          ))}
                          {(item.sources?.length ?? 0) > 5 && (
                            <span className="text-[11px] text-nexo-faint px-2 py-0.5">
                              +{item.sources!.length - 5} outras
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Fan-out queries */}
                    {(item.fan_out_queries?.length ?? 0) > 0 && (
                      <div>
                        <p className="nexo-label mb-1">Consultas relacionadas</p>
                        <div className="flex flex-wrap gap-1">
                          {item.fan_out_queries!.slice(0, 5).map((q, qi) => (
                            <span key={qi} className="text-[11px] text-nexo-dim bg-nexo-surface-2 px-2 py-0.5 rounded-md">
                              {q}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Trend sparkline */}
                  {(item.monthly_searches?.length ?? 0) > 0 && (
                    <div className="mt-2">
                      <p className="nexo-label mb-0.5">Tendência do volume em IA</p>
                      <Sparkline monthly={item.monthly_searches} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasQuery && !error && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-16 text-center">
          <p className="text-nexo-faint text-sm">Digite uma palavra-chave ou um domínio acima para ver como os modelos de IA o mencionam.</p>
          <p className="text-nexo-faint text-xs mt-1">Dados da API DataForSEO LLM Mentions Search.</p>
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
                <a key={entry.id} href={`/dashboard/ai-optimization?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {PLATFORM_LABELS[entry.platform] ?? entry.platform}
                      {entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-nexo-faint">
                    {new Date(entry.ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(AiOptimizationPage);
