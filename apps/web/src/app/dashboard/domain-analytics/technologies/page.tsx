import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getDomainTechHistory,
  saveDomainTechSearch,
  getDomainTechResult,
  getDomainFindHistory,
  saveDomainFindSearch,
  getDomainFindResults,
  type DomainTechEntry,
  type DomainFindEntry,
} from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import TechFindTable from './TechFindTable';

export const dynamic = 'force-dynamic';

// ---- Types ----

// technologies: { category: { subcategory: ["TechName", ...] } }
// e.g. { content: { cms: ["WordPress"] }, servers: { cdn: ["Cloudflare"] } }
type TechCategories = Record<string, Record<string, string[]>>;

interface DomainTechResult {
  domain?: string;
  title?: string;
  description?: string;
  domain_rank?: number;
  last_visited?: string;
  country_iso_code?: string;
  phone_numbers?: string[];
  emails?: string[];
  social_graph_urls?: string[];
  technologies?: TechCategories;
}

interface FindDomainItem {
  domain?: string;
  title?: string;
  description?: string;
  domain_rank?: number;
  country_iso_code?: string;
  last_visited?: string;
  technologies?: TechCategories;
}

interface SearchParams {
  mode?: string;
  target?: string;
  keyword?: string;
  technology?: string;
  limit?: string;
  history_id?: string;
  find_history_id?: string;
}

// ---- Prices ----
const PRICE_DOMAIN = 0.001;
const PRICE_FIND = 0.01;

// ---- API ----

function cleanTarget(t: string) {
  return t.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function fetchDomainTech(
  target: string,
  login: string,
  pass: string,
): Promise<{ result: DomainTechResult | null; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<DomainTechResult>(
    'domain_analytics/technologies/domain_technologies/live', { target }, { login, pass }, 20_000,
  );
  if (error) return { result: null, error };
  return { result: result ?? null, cost };
}

async function fetchDomainsByTech(opts: {
  keyword?: string;
  technology?: string;
  limit: number;
  login: string;
  pass: string;
}): Promise<{ items: FindDomainItem[]; total?: number; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { limit: opts.limit, order_by: ['domain_rank,desc'] };
  if (opts.technology) body.technologies = [opts.technology];
  if (opts.keyword) body.keywords = [opts.keyword];

  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: FindDomainItem[] }>(
    'domain_analytics/technologies/domains_by_technology/live', body, { login: opts.login, pass: opts.pass }, 20_000,
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], total: result?.total_count, cost };
}

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('pt-BR');
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CATEGORY_COLORS: Record<string, string> = {
  'content': 'bg-nexo-blue/10 border-nexo-border-strong text-nexo-sky',
  'analytics': 'bg-nexo-blue/10 border-nexo-border-strong text-nexo-sky',
  'marketing': 'bg-nexo-blue/10 border-nexo-border-strong text-nexo-sky',
  'sales': 'bg-nexo-ice/10 border-nexo-ice/30 text-nexo-ice',
  'add_ons': 'bg-nexo-warn/10 border-nexo-warn/40 text-nexo-warn-text',
  'security': 'bg-nexo-danger/10 border-nexo-danger/40 text-nexo-danger-text',
  'web_development': 'bg-nexo-blue/10 border-nexo-border-strong text-nexo-sky',
  'servers': 'bg-nexo-blue/10 border-nexo-border-strong text-nexo-sky',
};

function categoryColor(cat: string) {
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (cat.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'bg-white/[0.02] border-nexo-border text-nexo-dim';
}

function formatLabel(slug: string) {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PriceTag({ price }: { price: number }) {
  return <span className="font-mono text-[10px] opacity-50 ml-1.5">~US$ {price.toFixed(3).replace('.', ',')}</span>;
}

function entryLabel(e: DomainFindEntry) {
  const parts = [];
  if (e.technology) parts.push(e.technology);
  if (e.keyword) parts.push(`"${e.keyword}"`);
  return parts.join(' + ') || '—';
}

// ---- Page ----

async function TechnologiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;

  const mode = params.mode === 'find' ? 'find' : 'domain';
  const historyId = params.history_id;
  const findHistoryId = params.find_history_id;

  // --- Domain mode ---
  const target = cleanTarget(params.target?.trim() ?? '');
  let domainResult: DomainTechResult | null = null;
  let domainCost: number | undefined;
  let domainError: string | null = null;
  let isDomainFromHistory = false;
  let activeDomainEntry: DomainTechEntry | null = null;

  // --- Find mode ---
  const keyword = params.keyword?.trim() ?? '';
  const technology = params.technology?.trim() ?? '';
  const limit = Math.min(parseInt(params.limit ?? '20', 10) || 20, 100);
  let findItems: FindDomainItem[] = [];
  let findTotal: number | undefined;
  let findCost: number | undefined;
  let findError: string | null = null;
  let isFindFromHistory = false;
  let activeFindEntry: DomainFindEntry | null = null;

  if (mode === 'domain') {
    if (historyId) {
      domainResult = getDomainTechResult<DomainTechResult>(historyId);
      if (domainResult) {
        isDomainFromHistory = true;
        const history = getDomainTechHistory();
        activeDomainEntry = history.find((e) => e.id === historyId) ?? null;
      } else {
        domainError = "Esta busca não está mais disponível.";
      }
    } else if (target) {
      const dedupeId = stableSearchId(['domain-tech', target]);
      const cachedResult = getDomainTechResult<DomainTechResult>(dedupeId);
      if (cachedResult) {
        domainResult = cachedResult;
        domainCost = getDomainTechHistory().find((e) => e.id === dedupeId)?.cost;
      } else if (!creds) {
        domainError = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.';
      } else {
        const res = await fetchDomainTech(target, creds.login, creds.pass);
        if (res.error) {
          domainError = res.error;
        } else if (res.result) {
          domainResult = res.result;
          domainCost = res.cost;
          const entry: DomainTechEntry = { id: dedupeId, ts: Date.now(), target, cost: domainCost };
          saveDomainTechSearch(entry, domainResult);
        } else {
          domainError = 'Nenhum dado encontrado para este domínio.';
        }
      }
    }
  }

  if (mode === 'find') {
    if (findHistoryId) {
      findItems = getDomainFindResults<FindDomainItem>(findHistoryId) ?? [];
      if (findItems.length > 0) {
        isFindFromHistory = true;
        const history = getDomainFindHistory();
        activeFindEntry = history.find((e) => e.id === findHistoryId) ?? null;
        findTotal = activeFindEntry?.totalCount;
      } else {
        findError = "Esta busca não está mais disponível.";
      }
    } else if (keyword || technology) {
      const dedupeId = stableSearchId(['domain-find', keyword, technology, limit]);
      const cachedItems = getDomainFindResults<FindDomainItem>(dedupeId);
      if (cachedItems) {
        findItems = cachedItems;
        const cachedEntry = getDomainFindHistory().find((e) => e.id === dedupeId);
        findTotal = cachedEntry?.totalCount;
        findCost = cachedEntry?.cost;
      } else if (!creds) {
        findError = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.';
      } else {
        const res = await fetchDomainsByTech({ keyword: keyword || undefined, technology: technology || undefined, limit, login: creds.login, pass: creds.pass });
        if (res.error) {
          findError = res.error;
        } else {
          findItems = res.items;
          findTotal = res.total;
          findCost = res.cost;
          if (findItems.length > 0) {
            const entry: DomainFindEntry = { id: dedupeId, ts: Date.now(), keyword: keyword || undefined, technology: technology || undefined, count: findItems.length, totalCount: findTotal, cost: findCost };
            saveDomainFindSearch(entry, findItems);
          }
        }
      }
    }
  }

  const domainHistory = getDomainTechHistory();
  const findHistory = getDomainFindHistory();
  const displayTarget = activeDomainEntry?.target ?? target;

  const techCategories = domainResult?.technologies
    ? Object.entries(domainResult.technologies).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const totalTechs = techCategories.reduce(
    (s, [, subcats]) => s + new Set(Object.values(subcats).flat()).size,
    0,
  );

  const activeTech = activeFindEntry?.technology ?? technology;
  const activeKw = activeFindEntry?.keyword ?? keyword;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Tecnologias</h1>
        <p className="text-sm text-nexo-faint mt-1">Detecte o conjunto de tecnologias de um site ou encontre domínios por tecnologia e palavra-chave.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-nexo-surface-2 p-1 rounded-nexo-lg w-fit">
        {([
          { label: 'Analisar domínio', value: 'domain' },
          { label: 'Encontrar domínios', value: 'find' },
        ] as const).map((tab) => (
          <a
            key={tab.value}
            href={`/dashboard/domain-analytics/technologies?mode=${tab.value}`}
            className={`px-4 py-1.5 rounded-nexo text-xs font-medium uppercase tracking-widest transition-all ${
              mode === tab.value
                ? 'bg-nexo-surface text-nexo-text shadow-sm'
                : 'text-nexo-faint hover:text-white'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Domain mode form */}
      {mode === 'domain' && (
        <SearchForm
          className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
          btnLabel={<>Analisar<PriceTag price={PRICE_DOMAIN} /></>}
          btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors"
        >
          <input type="hidden" name="mode" value="domain" />
          <div>
            <label className="nexo-label block mb-1.5">Domínio</label>
            <input
              type="text" name="target"
              defaultValue={displayTarget}
              placeholder="ex.: exemplo.com.br"
              required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono transition-all"
            />
          </div>
        </SearchForm>
      )}

      {/* Find Domains form */}
      {mode === 'find' && (
        <SearchForm
          className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
          btnLabel={<>Buscar<PriceTag price={PRICE_FIND} /></>}
          btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors"
        >
          <input type="hidden" name="mode" value="find" />
          <p className="text-xs text-nexo-faint">Preencha um ou os dois campos para refinar a busca.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="nexo-label block mb-1.5">Tecnologia</label>
              <input
                type="text" name="technology"
                defaultValue={activeTech}
                placeholder="ex.: WordPress, Shopify, React…"
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all"
              />
            </div>
            <div>
              <label className="nexo-label block mb-1.5">Palavra-chave</label>
              <input
                type="text" name="keyword"
                defaultValue={activeKw}
                placeholder="ex.: encanador, dentista…"
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="w-32">
              <label className="nexo-label block mb-1.5">Resultados</label>
              <select name="limit" defaultValue={String(limit)}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </SearchForm>
      )}

      {/* Errors */}
      {mode === 'domain' && domainError && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{domainError}</div>
      )}
      {mode === 'find' && findError && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{findError}</div>
      )}

      {/* ---- Domain results ---- */}
      {mode === 'domain' && (historyId || target) && !domainError && domainResult && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="nexo-label">Domínio</span>
              <span className="font-mono font-medium text-nexo-text">{domainResult.domain ?? displayTarget}</span>
              {isDomainFromHistory && (
                <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>
              )}
            </div>
            {domainResult.domain_rank !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="nexo-label">DR</span>
                <span className="font-mono font-medium text-nexo-text">{fmt(domainResult.domain_rank)}</span>
              </div>
            )}
            {domainResult.country_iso_code && (
              <span className="text-sm font-medium text-nexo-dim uppercase">{domainResult.country_iso_code}</span>
            )}
            {totalTechs > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="nexo-label">Tecnologias</span>
                <span className="font-mono font-medium text-nexo-text">{totalTechs}</span>
              </div>
            )}
            {domainCost !== undefined && (
              <span className="text-[10px] font-mono text-nexo-faint ml-auto">custo: US$ {domainCost.toFixed(4).replace('.', ',')}</span>
            )}
          </div>

          {/* Domain meta */}
          {(domainResult.title || domainResult.emails?.length || domainResult.phone_numbers?.length || domainResult.social_graph_urls?.length) && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5 space-y-3">
              <h2 className="nexo-label">Informações do domínio</h2>
              {domainResult.title && <p className="text-sm font-medium text-nexo-text">{domainResult.title}</p>}
              {domainResult.description && <p className="text-sm text-nexo-dim">{domainResult.description}</p>}
              <div className="flex flex-wrap gap-4 pt-1">
                {domainResult.emails && domainResult.emails.length > 0 && (
                  <div>
                    <p className="nexo-label mb-1">E-mails</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domainResult.emails.map((e, i) => (
                        <span key={i} className="text-xs font-mono bg-white/[0.02] border border-nexo-border text-nexo-dim px-2 py-0.5 rounded-md">{e}</span>
                      ))}
                    </div>
                  </div>
                )}
                {domainResult.phone_numbers && domainResult.phone_numbers.length > 0 && (
                  <div>
                    <p className="nexo-label mb-1">Telefone</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domainResult.phone_numbers.map((p, i) => (
                        <span key={i} className="text-xs font-mono bg-white/[0.02] border border-nexo-border text-nexo-dim px-2 py-0.5 rounded-md">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {domainResult.social_graph_urls && domainResult.social_graph_urls.length > 0 && (
                  <div>
                    <p className="nexo-label mb-1">Redes sociais</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domainResult.social_graph_urls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono bg-white/[0.02] border border-nexo-border text-nexo-sky hover:text-white px-2 py-0.5 rounded-md truncate max-w-[200px]">{u}</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tech stack */}
          {techCategories.length > 0 ? (
            <div className="space-y-4">
              {techCategories.map(([category, subcats]) => {
                const subEntries = Object.entries(subcats).sort(([a], [b]) => a.localeCompare(b));
                const colorClass = categoryColor(category);
                const uniqueCount = new Set(subEntries.flatMap(([, names]) => names)).size;
                return (
                  <div id="results" key={category} className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-nexo-border flex items-center justify-between">
                      <h2 className="nexo-label">{formatLabel(category)}</h2>
                      <span className="text-[10px] font-medium text-nexo-faint">{uniqueCount}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {subEntries.map(([subcat, names]) => (
                        <div key={subcat}>
                          <p className="nexo-label mb-1.5">{formatLabel(subcat)}</p>
                          <div className="flex flex-wrap gap-2">
                            {names.map((name) => (
                              <span key={name} className={`inline-flex items-center px-3 py-1.5 rounded-nexo-lg border text-xs font-medium ${colorClass}`}>
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center text-sm text-nexo-faint">
              Nenhuma tecnologia detectada neste domínio.
            </div>
          )}

          {/* Domain history */}
          {domainHistory.length > 0 && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Histórico</h2>
              </div>
              <div className="divide-y divide-nexo-border">
                {domainHistory.map((entry) => {
                  const isActive = entry.id === historyId;
                  return (
                    <a key={entry.id} href={`/dashboard/domain-analytics/technologies?mode=domain&history_id=${entry.id}#results`}
                      className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                        {entry.cost !== undefined && <p className="text-[11px] text-nexo-faint mt-0.5">US$ {entry.cost.toFixed(4).replace('.', ',')}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-nexo-faint">{fmtDate(entry.ts)}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- Find results ---- */}
      {mode === 'find' && (findHistoryId || keyword || technology) && !findError && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            {activeTech && (
              <div className="flex items-center gap-1.5">
                <span className="nexo-label">Tecnologia</span>
                <span className="px-2 py-0.5 rounded-nexo bg-nexo-blue/10 border border-nexo-border-strong text-nexo-sky text-xs font-medium">{activeTech}</span>
              </div>
            )}
            {activeKw && (
              <div className="flex items-center gap-1.5">
                <span className="nexo-label">Palavra-chave</span>
                <span className="px-2 py-0.5 rounded-nexo bg-nexo-blue/10 border border-nexo-border-strong text-nexo-sky text-xs font-medium">&ldquo;{activeKw}&rdquo;</span>
              </div>
            )}
            {isFindFromHistory && (
              <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>
            )}
            {findTotal !== undefined && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="nexo-label">Total</span>
                <span className="font-mono font-medium text-nexo-text">{fmt(findTotal)}</span>
                <span className="text-xs text-nexo-faint">domínios</span>
                {findCost !== undefined && <span className="text-[10px] font-mono text-nexo-faint ml-2">· custo: US$ {findCost.toFixed(4).replace('.', ',')}</span>}
              </div>
            )}
          </div>

          {findItems.length === 0 ? (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center text-sm text-nexo-faint">
              Nenhum domínio encontrado.
            </div>
          ) : (
            <TechFindTable items={findItems} />
          )}

          {/* Find history */}
          {findHistory.length > 0 && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Histórico</h2>
              </div>
              <div className="divide-y divide-nexo-border">
                {findHistory.map((entry) => {
                  const isActive = entry.id === findHistoryId;
                  return (
                    <a key={entry.id} href={`/dashboard/domain-analytics/technologies?mode=find&find_history_id=${entry.id}#results`}
                      className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entryLabel(entry)}</p>
                        <p className="text-[11px] text-nexo-faint mt-0.5">
                          {entry.count} exibidos
                          {entry.totalCount !== undefined ? ` / ${fmt(entry.totalCount)} no total` : ''}
                          {entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-nexo-faint">{fmtDate(entry.ts)}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default withProjectScope(TechnologiesPage);
