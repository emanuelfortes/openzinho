import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getDomainWhoisHistory,
  saveDomainWhoisSearch,
  getDomainWhoisResult,
  type DomainWhoisEntry,
} from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';

export const dynamic = 'force-dynamic';

// ---- Types ----

interface WhoisMetrics {
  organic?: {
    pos_1?: number;
    pos_2_3?: number;
    pos_4_10?: number;
    pos_11_20?: number;
    pos_21_30?: number;
    pos_31_40?: number;
    pos_41_50?: number;
    pos_51_60?: number;
    pos_61_70?: number;
    pos_71_80?: number;
    pos_81_90?: number;
    pos_91_100?: number;
    etv?: number;
    impressions_etv?: number;
    count?: number;
    estimated_paid_traffic_cost?: number;
  };
  paid?: {
    pos_1?: number;
    pos_2_3?: number;
    etv?: number;
    count?: number;
  };
}

interface BacklinksInfo {
  referring_domains?: number;
  referring_main_domains?: number;
  referring_pages?: number;
  backlinks?: number;
  rank?: number;
  main_domain_rank?: number;
}

interface WhoisResult {
  domain?: string;
  registered?: boolean;
  created_datetime?: string;
  expiration_datetime?: string;
  updated_datetime?: string;
  registrar?: string;
  epp_status_codes?: string[];
  nameservers?: string[];
  metrics?: WhoisMetrics;
  backlinks_info?: BacklinksInfo;
}

interface SearchParams {
  domain?: string;
  history_id?: string;
}

// ---- API ----

function cleanTarget(t: string) {
  return t.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function fetchWhois(
  domain: string,
  login: string,
  pass: string,
): Promise<{ result: WhoisResult | null; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: WhoisResult[] }>(
    'domain_analytics/whois/overview/live', { filters: ['domain', '=', domain], limit: 1 }, { login, pass }, 20_000,
  );
  if (error) return { result: null, error };
  return { result: result?.items?.[0] ?? null, cost };
}

// ---- Price ----
const PRICE_WHOIS = 0.001;

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('pt-BR');
}

function fmtDate(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
      <p className="nexo-label">{label}</p>
      <p className="text-xl font-medium text-nexo-text mt-1 tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

function daysUntil(dateStr?: string) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ---- Page ----

async function WhoisPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;
  const domain = cleanTarget(params.domain?.trim() ?? '');

  let result: WhoisResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: DomainWhoisEntry | null = null;

  if (historyId) {
    result = getDomainWhoisResult<WhoisResult>(historyId);
    if (result) {
      isFromHistory = true;
      const history = getDomainWhoisHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = "Esta busca não está mais disponível.";
    }
  }

  if (!historyId && domain) {
    const dedupeId = stableSearchId(['domain-whois', domain]);
    const cachedResult = getDomainWhoisResult<WhoisResult>(dedupeId);
    if (cachedResult) {
      result = cachedResult;
      cost = getDomainWhoisHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) {
      error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const res = await fetchWhois(domain, creds.login, creds.pass);
      if (res.error) {
        error = res.error;
      } else if (res.result) {
        result = res.result;
        cost = res.cost;
        const entry: DomainWhoisEntry = {
          id: dedupeId,
          ts: Date.now(),
          domain,
          cost,
        };
        saveDomainWhoisSearch(entry, result);
      } else {
        error = 'Nenhum dado de Whois encontrado para este domínio.';
      }
    }
  }

  const history = getDomainWhoisHistory();
  const hasQuery = historyId || domain;
  const displayDomain = activeEntry?.domain ?? domain;

  const expiresIn = daysUntil(result?.expiration_datetime);
  const expiresColor = expiresIn !== null
    ? expiresIn < 30 ? 'text-nexo-danger-text' : expiresIn < 90 ? 'text-nexo-warn-text' : 'text-nexo-ice'
    : '';

  const org = result?.metrics?.organic;
  const paid = result?.metrics?.paid;
  const bl = result?.backlinks_info;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Whois</h1>
        <p className="text-sm text-nexo-faint mt-1">Dados de registro do domínio com métricas de tráfego e backlinks.</p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
        btnLabel={<>Consultar<span className="font-mono text-[10px] opacity-50 ml-1.5">~US$ {PRICE_WHOIS.toFixed(3).replace('.', ',')}</span></>}
        btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors"
      >
        <div>
          <label className="nexo-label block mb-1.5">Domínio</label>
          <input
            type="text" name="domain"
            defaultValue={displayDomain}
            placeholder="ex.: exemplo.com.br"
            required
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono transition-all"
          />
        </div>
      </SearchForm>

      {error && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>
      )}

      {hasQuery && !error && result && (
        <>
          {/* Header */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="nexo-label">Domínio</span>
              <span className="font-mono font-medium text-nexo-text">{result.domain ?? displayDomain}</span>
              {isFromHistory && (
                <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>
              )}
            </div>
            {result.registered !== undefined && (
              <span className={`text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-md ${result.registered ? 'text-nexo-ice bg-nexo-ice/10' : 'text-nexo-faint bg-nexo-surface-2'}`}>
                {result.registered ? 'Registrado' : 'Não registrado'}
              </span>
            )}
            {cost !== undefined && (
              <span className="text-[10px] font-mono text-nexo-faint ml-auto">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>
            )}
          </div>

          {/* Registration info */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5 space-y-4">
            <h2 className="nexo-label">Registro</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="nexo-label">Registrador</p>
                <p className="text-sm font-medium text-nexo-text mt-0.5">{result.registrar ?? '—'}</p>
              </div>
              <div>
                <p className="nexo-label">Criado em</p>
                <p className="text-sm font-medium text-nexo-text mt-0.5">{fmtDate(result.created_datetime)}</p>
              </div>
              <div>
                <p className="nexo-label">Atualizado em</p>
                <p className="text-sm font-medium text-nexo-text mt-0.5">{fmtDate(result.updated_datetime)}</p>
              </div>
              <div>
                <p className="nexo-label">Expira em</p>
                <p className={`text-sm font-medium mt-0.5 ${expiresColor}`}>{fmtDate(result.expiration_datetime)}</p>
                {expiresIn !== null && (
                  <p className={`text-[10px] font-medium mt-0.5 ${expiresColor}`}>
                    {expiresIn > 0 ? `${expiresIn} ${expiresIn === 1 ? 'dia restante' : 'dias restantes'}` : `Expirou há ${Math.abs(expiresIn)} ${Math.abs(expiresIn) === 1 ? 'dia' : 'dias'}`}
                  </p>
                )}
              </div>
            </div>
            {result.epp_status_codes && result.epp_status_codes.length > 0 && (
              <div>
                <p className="nexo-label mb-1.5">Status EPP</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.epp_status_codes.map((s, i) => (
                    <span key={i} className="text-[10px] font-mono bg-white/[0.02] border border-nexo-border text-nexo-dim px-2 py-0.5 rounded-md">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {result.nameservers && result.nameservers.length > 0 && (
              <div>
                <p className="nexo-label mb-1.5">Servidores de nomes</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.nameservers.map((ns, i) => (
                    <span key={i} className="text-[10px] font-mono bg-white/[0.02] border border-nexo-border text-nexo-dim px-2 py-0.5 rounded-md">{ns}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Backlinks */}
          {bl && (
            <div>
              <h2 className="nexo-label mb-3">Backlinks</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Backlinks" value={fmt(bl.backlinks)} />
                <StatCard label="Domínios de referência" value={fmt(bl.referring_domains)} />
                <StatCard label="Domínios principais de referência" value={fmt(bl.referring_main_domains)} />
                <StatCard label="Páginas de referência" value={fmt(bl.referring_pages)} />
                <StatCard label="Domain Rank" value={fmt(bl.rank)} />
                <StatCard label="Domain Rank do domínio principal" value={fmt(bl.main_domain_rank)} />
              </div>
            </div>
          )}

          {/* Organic traffic */}
          {org && (
            <div>
              <h2 className="nexo-label mb-3">Busca orgânica</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Palavras-chave" value={fmt(org.count)} />
                <StatCard label="Tráfego (ETV)" value={fmt(org.etv)} />
                <StatCard label="Valor do tráfego" value={org.estimated_paid_traffic_cost !== undefined ? `US$ ${fmt(Math.round(org.estimated_paid_traffic_cost))}` : '—'} />
                <StatCard label="Top 3" value={fmt((org.pos_1 ?? 0) + (org.pos_2_3 ?? 0))} />
              </div>
              {/* Position distribution */}
              {[
                { label: '#1', value: org.pos_1 },
                { label: '#2–3', value: org.pos_2_3 },
                { label: '#4–10', value: org.pos_4_10 },
                { label: '#11–20', value: org.pos_11_20 },
                { label: '#21–30', value: org.pos_21_30 },
                { label: '#31–100', value: (org.pos_31_40 ?? 0) + (org.pos_41_50 ?? 0) + (org.pos_51_60 ?? 0) + (org.pos_61_70 ?? 0) + (org.pos_71_80 ?? 0) + (org.pos_81_90 ?? 0) + (org.pos_91_100 ?? 0) },
              ].some(({ value }) => value) && (
                <div className="mt-3 bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
                  <h3 className="nexo-label mb-4">Distribuição de posições</h3>
                  <div className="space-y-2">
                    {[
                      { label: '#1', value: org.pos_1 },
                      { label: '#2–3', value: org.pos_2_3 },
                      { label: '#4–10', value: org.pos_4_10 },
                      { label: '#11–20', value: org.pos_11_20 },
                      { label: '#21–30', value: org.pos_21_30 },
                      { label: '#31–100', value: (org.pos_31_40 ?? 0) + (org.pos_41_50 ?? 0) + (org.pos_51_60 ?? 0) + (org.pos_61_70 ?? 0) + (org.pos_71_80 ?? 0) + (org.pos_81_90 ?? 0) + (org.pos_91_100 ?? 0) },
                    ].map(({ label, value }) => {
                      const total = org.count ?? 1;
                      const pct = Math.round(((value ?? 0) / total) * 100);
                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono font-medium text-nexo-dim w-12">{label}</span>
                            <span className="text-xs font-mono text-nexo-dim">{fmt(value)} <span className="text-nexo-faint">({pct}%)</span></span>
                          </div>
                          <div className="h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-nexo-blue rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Paid */}
          {paid && (paid.count ?? 0) > 0 && (
            <div>
              <h2 className="nexo-label mb-3">Busca paga</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Palavras-chave pagas" value={fmt(paid.count)} />
                <StatCard label="Tráfego pago (ETV)" value={fmt(paid.etv)} />
                <StatCard label="Primeira posição" value={fmt(paid.pos_1)} />
              </div>
            </div>
          )}
        </>
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
                <a
                  key={entry.id}
                  href={`/dashboard/domain-analytics/whois?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.domain}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.cost !== undefined ? `US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
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

export default withProjectScope(WhoisPage);
