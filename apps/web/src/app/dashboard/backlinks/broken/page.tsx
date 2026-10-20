import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getBlBrokenHistory, saveBlBroken, getBlBrokenResults, type BlBrokenEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import BrokenBacklinksTable from './BrokenBacklinksTable';
import { groupByBrokenPage, type BrokenLink } from './group';

interface SearchParams { target?: string; limit?: string; dofollow?: string; history_id?: string; }

const LIMITS = [100, 500, 1000];

// A domain is sent bare (example.com); a page keeps its absolute URL, as the Backlinks API expects.
function normalizeTarget(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const hasPath = (u.pathname && u.pathname !== '/') || u.search;
    return hasPath ? `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname}${u.search}` : host;
  } catch {
    return t.toLowerCase();
  }
}

async function fetchBroken(
  target: string,
  limit: number,
  dofollowOnly: boolean,
  login: string,
  pass: string,
): Promise<{ items: BrokenLink[]; total: number; cost?: number; error?: string }> {
  // is_broken = the link points to a page answering 4xx/5xx (url_to_status_code holds the exact code).
  const broken = ['is_broken', '=', true];
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: BrokenLink[] }>(
    'backlinks/backlinks/live',
    {
      target,
      limit,
      mode: 'as_is',
      include_subdomains: true,
      backlinks_status_type: 'live',
      filters: dofollowOnly ? [broken, 'and', ['dofollow', '=', true]] : broken,
      order_by: ['domain_from_rank,desc'],
    },
    { login, pass },
  );
  if (error) return { items: [], total: 0, error };
  // Keep only what the page uses: the raw backlink objects are large and stored as-is in history.
  const items = (result?.items ?? []).map((l) => ({
    type: l.type,
    domain_from: l.domain_from,
    url_from: l.url_from,
    url_to: l.url_to,
    url_to_status_code: l.url_to_status_code,
    domain_from_rank: l.domain_from_rank,
    page_from_rank: l.page_from_rank,
    anchor: l.anchor,
    image_url: l.image_url,
    dofollow: l.dofollow,
    first_seen: l.first_seen,
    last_seen: l.last_seen,
  }));
  return { items, total: result?.total_count ?? items.length, cost };
}

function fmt(n?: number) { return n === undefined ? '—' : n.toLocaleString('pt-BR'); }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
      <p className="nexo-label">{label}</p>
      <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-nexo-faint mt-0.5">{hint}</p>}
    </div>
  );
}

async function BrokenBacklinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultDomain = getSetting('default_domain') ?? '';
  const target = normalizeTarget(params.target ?? '');
  const limit = LIMITS.includes(Number(params.limit)) ? Number(params.limit) : 500;
  const dofollowOnly = params.dofollow === 'true';
  const historyId = params.history_id;

  let items: BrokenLink[] = [];
  let total = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlBrokenEntry | null = null;

  if (historyId) {
    const saved = getBlBrokenResults<BrokenLink>(historyId);
    if (saved) {
      items = saved;
      activeEntry = getBlBrokenHistory().find((e) => e.id === historyId) ?? null;
      total = activeEntry?.total ?? items.length;
      cost = activeEntry?.cost;
    } else error = 'Esta busca não está mais disponível.';
  } else if (target) {
    const dedupeId = stableSearchId(['bl-broken', target, limit, dofollowOnly]);
    const cached = getBlBrokenResults<BrokenLink>(dedupeId);
    if (cached) {
      items = cached;
      activeEntry = getBlBrokenHistory().find((e) => e.id === dedupeId) ?? null;
      total = activeEntry?.total ?? items.length;
      cost = activeEntry?.cost;
    } else if (!creds) {
      error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const res = await fetchBroken(target, limit, dofollowOnly, creds.login, creds.pass);
      if (res.error) error = res.error;
      else {
        items = res.items; total = res.total; cost = res.cost;
        // Saved even when empty: "no broken backlinks" is a useful, paid-for answer.
        saveBlBroken({ id: dedupeId, ts: Date.now(), target, dofollowOnly, count: items.length, total, cost }, items);
      }
    }
  }

  const history = getBlBrokenHistory();
  const displayTarget = activeEntry?.target ?? target;
  const displayDofollow = activeEntry?.dofollowOnly ?? dofollowOnly;
  const pages = groupByBrokenPage(items);
  const domains = new Set(items.map((l) => l.domain_from).filter(Boolean)).size;
  const dofollowCount = items.filter((l) => l.dofollow).length;
  const fileSlug = displayTarget.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '-');

  const linksCsv = items.map((l) => ({
    broken_page: l.url_to ?? '',
    status: l.url_to_status_code ?? '',
    source: l.url_from ?? '',
    domain_from: l.domain_from ?? '',
    dr: l.domain_from_rank ?? '',
    anchor: l.anchor ?? '',
    dofollow: l.dofollow ? 'yes' : 'no',
    first_seen: l.first_seen?.split(' ')[0]?.split('T')[0] ?? '',
  }));
  const pagesMd = pages.map((p) => ({
    page: p.url,
    status: p.statuses.join(', '),
    links: p.links.length,
    domains: p.domains,
    dofollow: p.dofollow,
    best_dr: p.bestDr ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-white transition-colors">Backlinks</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Backlinks quebrados</span>
        </div>
        <h1 className="nexo-h1">Backlinks quebrados</h1>
        <p className="text-sm text-nexo-faint mt-1 max-w-2xl">
          Backlinks ativos que apontam para páginas que respondem 4xx ou 5xx. No seu site, aplique um redirecionamento 301 ou restaure essas páginas para recuperar os links.
          Num concorrente, cada página quebrada é uma oportunidade de broken link building: ofereça seu conteúdo aos sites que ainda apontam para ela.
        </p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Encontrar backlinks quebrados" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors" disabled={!creds}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="bb-target" className="nexo-label block mb-1.5">Domínio ou página</label>
            <input id="bb-target" type="text" name="target" defaultValue={displayTarget || defaultDomain} placeholder="example.com" required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
          </div>
          <div>
            <label htmlFor="bb-dofollow" className="nexo-label block mb-1.5">Links</label>
            <select id="bb-dofollow" name="dofollow" defaultValue={displayDofollow ? 'true' : ''}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              <option value="">Todos os links quebrados</option>
              <option value="true">Somente dofollow</option>
            </select>
          </div>
          <div>
            <label htmlFor="bb-limit" className="nexo-label block mb-1.5">Máximo de links</label>
            <select id="bb-limit" name="limit" defaultValue={String(limit)}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        {!creds && <p className="text-xs text-nexo-warn-text font-medium">Configure primeiro as credenciais da API em Configurações.</p>}
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || target) && !error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Backlinks quebrados" value={fmt(total)} hint={total > items.length ? `${fmt(items.length)} carregados` : undefined} />
            <Stat label="Páginas quebradas" value={fmt(pages.length)} hint={total > items.length ? 'nos links carregados' : undefined} />
            <Stat label="Domínios de referência" value={fmt(domains)} />
            <Stat label="Dofollow" value={fmt(dofollowCount)} hint={items.length ? `${Math.round((dofollowCount / items.length) * 100)}% dos links` : undefined} />
          </div>

          <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between gap-3 flex-wrap">
              <span className="nexo-label">
                {displayTarget}{displayDofollow && ' · somente dofollow'}
              </span>
              <div className="flex items-center gap-3">
                {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
                {items.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CopyMarkdownButton data={pagesMd} columns={[
                      { key: 'page', label: 'Página quebrada' }, { key: 'status', label: 'Status' }, { key: 'links', label: 'Links' },
                      { key: 'domains', label: 'Domínios de ref.' }, { key: 'dofollow', label: 'Dofollow' }, { key: 'best_dr', label: 'Melhor DR' },
                    ]} />
                    <ExportCSVButton data={linksCsv} filename={`broken-backlinks-${fileSlug}.csv`} columns={[
                      { key: 'broken_page', label: 'Página quebrada' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'URL de origem' },
                      { key: 'domain_from', label: 'Domínio de origem' }, { key: 'dr', label: 'DR' }, { key: 'anchor', label: 'Âncora' },
                      { key: 'dofollow', label: 'Dofollow' }, { key: 'first_seen', label: 'Visto pela primeira vez' },
                    ]} />
                  </div>
                )}
              </div>
            </div>
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-nexo-faint">
                Nenhum backlink quebrado encontrado{displayDofollow ? ' entre os links dofollow' : ''}. Todos os links ativos para este alvo chegam a uma página que funciona.
              </div>
            ) : (
              <BrokenBacklinksTable links={items} />
            )}
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Histórico</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === (historyId ?? activeEntry?.id);
              return (
                <a key={entry.id} href={`/dashboard/backlinks/broken?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {fmt(entry.total ?? entry.count)} backlinks quebrados{entry.dofollowOnly ? ' · somente dofollow' : ''}{entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
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

export default withProjectScope(BrokenBacklinksPage);
