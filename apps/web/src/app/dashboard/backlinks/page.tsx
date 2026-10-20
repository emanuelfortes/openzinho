import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getBacklinksHistory,
  saveBacklinksSearch,
  getBacklinksResult,
  getBacklinksLinks,
  type BacklinksSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import BacklinksTable from './BacklinksTable';

// ---- Types ----

interface LinkTypes {
  anchor?: number;
  image?: number;
  redirect?: number;
  canonical?: number;
  alternate?: number;
  hreflang?: number;
  nofollow_link?: number;
  form?: number;
  frame?: number;
  comment?: number;
}

interface BacklinksSummary {
  target?: string;
  rank?: number;
  backlinks?: number;
  new_backlinks?: number;
  lost_backlinks?: number;
  referring_domains?: number;
  new_referring_domains?: number;
  lost_referring_domains?: number;
  referring_ips?: number;
  referring_subnets?: number;
  referring_pages?: number;
  broken_backlinks?: number;
  broken_pages?: number;
  spam_score?: number;
  referring_links_types?: LinkTypes;
  referring_links_tld?: Record<string, number>;
}

export interface BacklinkItem {
  type?: string;
  domain_from?: string;
  url_from?: string;
  domain_to?: string;
  url_to?: string;
  page_from_rank?: number;
  domain_from_rank?: number;
  anchor?: string;
  alt?: string;
  image_url?: string;
  dofollow?: boolean;
  original?: boolean;
  is_broken?: boolean;
  url_to_status_code?: number;
  attributes?: string[];
  first_seen?: string;
  last_seen?: string;
}

interface SearchParams {
  target?: string;
  limit?: string;
  order_by?: string;
  dofollow?: string;
  history_id?: string;
}

// ---- API ----

function cleanTarget(t: string) {
  return t.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function fetchSummary(target: string, login: string, pass: string): Promise<{ result?: BacklinksSummary; cost?: number; error?: string }> {
  return callDataForSeoFirst<BacklinksSummary>('backlinks/summary/live', { target }, { login, pass });
}

async function fetchLinks(
  target: string,
  login: string,
  pass: string,
  limit: number,
  orderBy: string,
  dofollow: boolean | null,
): Promise<{ items: BacklinkItem[]; total: number; cost?: number; error?: string }> {
  const body: Record<string, unknown> = {
    target,
    limit,
    include_subdomains: true,
    order_by: [orderBy],
  };
  if (dofollow !== null) {
    body.filters = ['dofollow', '=', dofollow];
  }
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: BacklinkItem[] }>(
    'backlinks/backlinks/live', body, { login, pass },
  );
  if (error) return { items: [], total: 0, error };
  return { items: result?.items ?? [], total: result?.total_count ?? 0, cost };
}

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString("pt-BR");
}

function SpamBadge({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-nexo-faint">—</span>;
  const color = score >= 60 ? 'text-nexo-danger-text bg-nexo-danger/10 border-nexo-danger/40'
    : score >= 30 ? 'text-nexo-warn-text bg-nexo-warn/10 border-nexo-warn/40'
    : 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30';
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${color}`}>{score} / 100</span>;
}

function Delta({ value, invert = false }: { value?: number; invert?: boolean }) {
  if (!value) return null;
  const positive = invert ? value < 0 : value > 0;
  return (
    <span className={`text-[10px] font-medium ml-1 ${positive ? 'text-nexo-ice' : 'text-nexo-danger-text'}`}>
      {value > 0 ? '+' : ''}{fmt(value)}
    </span>
  );
}

function StatCard({ label, value, new: newVal, lost, href, hrefLabel }: { label: string; value?: number; new?: number; lost?: number; href?: string; hrefLabel?: string }) {
  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
      <p className="nexo-label">{label}</p>
      <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{fmt(value)}</p>
      {(newVal !== undefined || lost !== undefined) && (
        <p className="text-[11px] mt-0.5 text-nexo-faint">
          {newVal !== undefined && <><Delta value={newVal} /> novos</>}
          {newVal !== undefined && lost !== undefined && ' · '}
          {lost !== undefined && <><Delta value={-lost} invert /> perdidos</>}
        </p>
      )}
      {href && (
        <a href={href} className="inline-block text-[11px] font-medium text-nexo-sky hover:underline mt-0.5">{hrefLabel ?? 'Ver'} →</a>
      )}
    </div>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

async function BacklinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const target = params.target?.trim() ?? '';
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const orderBy = params.order_by ?? 'domain_from_rank,desc';
  const dofollowParam = params.dofollow;
  const dofollowFilter = dofollowParam === 'true' ? true : dofollowParam === 'false' ? false : null;

  let summary: BacklinksSummary | null = null;
  let links: BacklinkItem[] = [];
  let linksTotal = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: BacklinksSearchEntry | null = null;

  if (historyId) {
    const savedSummary = getBacklinksResult<BacklinksSummary>(historyId);
    const savedLinks = getBacklinksLinks<BacklinkItem>(historyId);
    if (savedSummary) {
      summary = savedSummary;
      links = savedLinks ?? [];
      isFromHistory = true;
      const history = getBacklinksHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
      linksTotal = activeEntry?.linksTotal ?? links.length;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  }

  if (!historyId && target) {
    const clean = cleanTarget(target);
    const dedupeId = stableSearchId(['backlinks', clean, limit, orderBy, dofollowFilter]);
    const cachedSummary = getBacklinksResult<BacklinksSummary>(dedupeId);

    if (cachedSummary) {
      summary = cachedSummary;
      links = getBacklinksLinks<BacklinkItem>(dedupeId) ?? [];
      const cachedEntry = getBacklinksHistory().find((e) => e.id === dedupeId);
      linksTotal = cachedEntry?.linksTotal ?? links.length;
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const [summaryRes, linksRes] = await Promise.all([
        fetchSummary(clean, creds.login, creds.pass),
        fetchLinks(clean, creds.login, creds.pass, limit, orderBy, dofollowFilter),
      ]);

      if (summaryRes.error || linksRes.error) {
        error = summaryRes.error ?? linksRes.error ?? 'Erro desconhecido.';
      } else {
        summary = summaryRes.result ?? null;
        links = linksRes.items;
        linksTotal = linksRes.total;
        cost = (summaryRes.cost ?? 0) + (linksRes.cost ?? 0);

        if (summary || links.length > 0) {
          const entry: BacklinksSearchEntry = {
            id: dedupeId,
            ts: Date.now(),
            target: clean,
            cost,
            linksTotal,
          };
          saveBacklinksSearch(entry, summary ?? {}, links, linksTotal);
        }
      }
    }
  }

  const history = getBacklinksHistory();
  const hasQuery = historyId || target;
  const displayTarget = activeEntry?.target ?? cleanTarget(target);

  const linkTypeEntries = summary?.referring_links_types
    ? Object.entries(summary.referring_links_types).filter(([, v]) => v && v > 0).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    : [];

  const tldEntries = summary?.referring_links_tld
    ? Object.entries(summary.referring_links_tld).sort(([, a], [, b]) => b - a).slice(0, 8)
    : [];
  const tldTotal = tldEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Backlinks</h1>
        <p className="text-sm text-nexo-faint mt-1">Perfil de links recebidos de um domínio via DataForSEO.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analisar" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Domínio alvo</label>
            <input
              type="text" name="target"
              defaultValue={displayTarget}
              placeholder="ex.: exemplo.com"
              required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono transition-all"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Ordenar por</label>
            <select name="order_by" defaultValue={orderBy}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="domain_from_rank,desc">DR do domínio de origem (maior)</option>
              <option value="page_from_rank,desc">Rank da página de origem (maior)</option>
              <option value="first_seen,desc">Mais recentes</option>
              <option value="first_seen,asc">Mais antigos</option>
            </select>
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Filtrar</label>
            <select name="dofollow" defaultValue={dofollowParam ?? ''}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="">Todos os links</option>
              <option value="true">Somente dofollow</option>
              <option value="false">Somente nofollow</option>
            </select>
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Número de links</label>
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

      {hasQuery && !error && (summary || links.length > 0) && (
        <>
          {/* Header */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="nexo-label">Domínio</span>
              <span className="font-mono font-medium text-nexo-text">{displayTarget}</span>
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            </div>
            {summary?.rank !== undefined && (
              <div className="flex items-center gap-2">
                <span className="nexo-label">DR</span>
                <span className="font-mono font-medium text-nexo-text">{summary.rank}</span>
              </div>
            )}
            {summary?.spam_score !== undefined && (
              <div className="flex items-center gap-2">
                <span className="nexo-label">Spam</span>
                <SpamBadge score={summary.spam_score} />
              </div>
            )}
            {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint ml-auto">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
          </div>

          {/* Summary stats */}
          {summary && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Backlinks" value={summary.backlinks} new={summary.new_backlinks} lost={summary.lost_backlinks} />
                <StatCard label="Domínios de referência" value={summary.referring_domains} new={summary.new_referring_domains} lost={summary.lost_referring_domains} />
                <StatCard label="IPs de referência" value={summary.referring_ips} />
                <StatCard label="Páginas de referência" value={summary.referring_pages} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Backlinks quebrados" value={summary.broken_backlinks}
                  href={summary.broken_backlinks ? `/dashboard/backlinks/broken?target=${encodeURIComponent(displayTarget)}` : undefined} hrefLabel="Ver links quebrados" />
                <StatCard label="Páginas quebradas" value={summary.broken_pages} />
                <StatCard label="Sub-redes de referência" value={summary.referring_subnets} />
              </div>

              {/* Link types + TLD */}
              {(linkTypeEntries.length > 0 || tldEntries.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {linkTypeEntries.length > 0 && (
                    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
                      <h2 className="nexo-label mb-4">Tipos de link</h2>
                      <div className="space-y-2">
                        {linkTypeEntries.map(([type, count]) => {
                          const pct = Math.round(((count ?? 0) / (summary.backlinks ?? 1)) * 100);
                          return (
                            <div key={type}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-nexo-dim capitalize">{type.replace(/_/g, ' ')}</span>
                                <span className="text-xs font-mono text-nexo-dim">{fmt(count)} <span className="text-nexo-faint">({pct}%)</span></span>
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
                  {tldEntries.length > 0 && (
                    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
                      <h2 className="nexo-label mb-4">TLDs dos domínios de referência</h2>
                      <div className="space-y-2">
                        {tldEntries.map(([tld, count]) => {
                          const pct = Math.round((count / tldTotal) * 100);
                          return (
                            <div key={tld}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-mono font-medium text-nexo-dim">.{tld}</span>
                                <span className="text-xs font-mono text-nexo-dim">{fmt(count)} <span className="text-nexo-faint">({pct}%)</span></span>
                              </div>
                              <div className="h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                                <div className="h-full bg-nexo-sky/40 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Backlinks list */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
              <h2 className="nexo-label">Lista de backlinks</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-nexo-faint">
                  {links.length} exibidos
                  {linksTotal > links.length && <span className="text-nexo-faint"> / {fmt(linksTotal)} no total</span>}
                </span>
                {links.length > 0 && (
                  <>
                    <CopyMarkdownButton
                      data={links.map((l) => ({
                        source: l.url_from,
                        domain_from: l.domain_from,
                        anchor: l.anchor,
                        target: l.url_to,
                        dr: l.domain_from_rank,
                        dofollow: l.dofollow ? 'yes' : 'no',
                        broken: l.is_broken ? 'yes' : 'no',
                        first_seen: l.first_seen?.split('T')[0] ?? '',
                      }))}
                      columns={[
                        { key: 'source', label: 'URL de origem' },
                        { key: 'domain_from', label: 'Domínio de origem' },
                        { key: 'anchor', label: 'Âncora' },
                        { key: 'target', label: 'URL de destino' },
                        { key: 'dr', label: 'DR' },
                        { key: 'dofollow', label: 'Dofollow' },
                        { key: 'broken', label: 'Quebrado' },
                        { key: 'first_seen', label: 'Visto pela primeira vez' },
                      ]}
                    />
                    <ExportCSVButton
                      data={links.map((l) => ({
                        source: l.url_from,
                        domain_from: l.domain_from,
                        anchor: l.anchor,
                        target: l.url_to,
                        dr: l.domain_from_rank,
                        dofollow: l.dofollow ? 'yes' : 'no',
                        broken: l.is_broken ? 'yes' : 'no',
                        first_seen: l.first_seen?.split('T')[0] ?? '',
                      }))}
                      filename={`backlinks-${target}.csv`}
                      columns={[
                        { key: 'source', label: 'URL de origem' },
                        { key: 'domain_from', label: 'Domínio de origem' },
                        { key: 'anchor', label: 'Âncora' },
                        { key: 'target', label: 'URL de destino' },
                        { key: 'dr', label: 'DR' },
                        { key: 'dofollow', label: 'Dofollow' },
                        { key: 'broken', label: 'Quebrado' },
                        { key: 'first_seen', label: 'Visto pela primeira vez' },
                      ]}
                    />
                  </>
                )}
              </div>
            </div>

            {links.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum backlink encontrado.</div>
            ) : (
              <BacklinksTable links={links} />
            )}
          </div>
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
                <a key={entry.id} href={`/dashboard/backlinks?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.linksTotal !== undefined ? `${fmt(entry.linksTotal)} backlinks` : ''}
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

export default withProjectScope(BacklinksPage);
