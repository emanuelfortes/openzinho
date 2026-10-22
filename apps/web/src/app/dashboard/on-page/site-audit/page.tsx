import { withProjectScope } from '@/lib/db';
import {
  getCredentials, getSiteAuditHistory, getSiteAuditTask, upsertSiteAuditTask,
  saveSiteAuditResult, getSiteAuditSummary, getSiteAuditPages,
  type SiteAuditEntry,
} from '@/lib/db';
import { redirect } from 'next/navigation';
import { getBrandSettings } from '@/lib/brand-server';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import ExportExcelButton from '@/components/ExportExcelButton';
import ReportPdfExportButton from '@/components/ReportPdfExportButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import SiteAuditPagesTable from './SiteAuditPagesTable';
import KeywordDensityTable from './KeywordDensityTable';
import LinksTable from './LinksTable';
import ResourcesTable from './ResourcesTable';
import NonIndexableTable from './NonIndexableTable';
import AutoRefresh from '@/components/AutoRefresh';
import { dataForSeoStatusMessage } from '@/lib/dataforseo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryResult {
  crawl_progress: 'in_progress' | 'finished';
  crawl_status: { max_crawl_pages: number; pages_in_queue: number; pages_crawled: number };
  domain_info?: {
    name?: string;
    ip?: string;
    server?: string;
    cms?: string;
    ssl_info?: {
      valid_certificate?: boolean;
      certificate_issuer?: string;
      certificate_expiration_date?: string;
    };
    checks?: Record<string, boolean | undefined>;
  };
  page_metrics?: {
    onpage_score?: number;
    internal_links_count?: number;
    external_links_count?: number;
    broken_links?: number;
    duplicate_content?: number;
    duplicate_description?: number;
    duplicate_title?: number;
    non_indexable?: number;
    checks?: Record<string, number | undefined>;
  };
}

interface AuditPage {
  url?: string;
  resource_type?: string;
  status_code?: number;
  onpage_score?: number;
  size?: number;
  meta?: {
    title?: string;
    description?: string;
    title_length?: number;
    description_length?: number;
    internal_links_count?: number;
    external_links_count?: number;
    images_count?: number;
    content?: { plain_text_word_count?: number };
  };
  page_timing?: { duration_time?: number; waiting_time?: number };

  checks?: Record<string, boolean | undefined>;
}

interface SearchParams {
  target?: string;
  task_id?: string;
  view?: string;
  kw_len?: string;
}

interface KwDensityItem {
  keyword?: string;
  frequency?: number;
  density?: number;
  url_count?: number;
  emphasized_keyword_frequency?: number;
}

interface LinkItem {
  link_from?: string;
  link_to?: string;
  domain_from?: string;
  domain_to?: string;
  type?: string;
  is_broken?: boolean;
  is_nofollowed?: boolean;
  anchor?: string;
  direction?: 'internal' | 'external';
}

interface ResourceItem {
  url?: string;
  resource_type?: string;
  status_code?: number;
  size?: number;
  encoded_size?: number;
  fetch_time?: number;
  checks?: { broken_resources?: boolean; is_redirect?: boolean };
  accept_type?: string;
}

interface NonIndexableItem { url?: string; reason?: string }

interface DuplicateTagPage { url?: string; meta?: { title?: string; description?: string } }
interface DuplicateTagItem {
  type?: string;
  tag?: string;
  pages?: DuplicateTagPage[];
  pages_count?: number;
}

// ─── Checks metadata ──────────────────────────────────────────────────────────

type Sev = 'error' | 'warning' | 'info' | 'good';

const PAGE_CHECKS: Record<string, { label: string; sev: Sev }> = {
  no_title: { label: 'Título ausente', sev: 'error' },
  no_description: { label: 'Descrição ausente', sev: 'error' },
  no_h1_tag: { label: 'H1 ausente', sev: 'error' },
  is_4xx_code: { label: 'Erro 4XX', sev: 'error' },
  is_5xx_code: { label: 'Erro 5XX', sev: 'error' },
  is_broken: { label: 'Quebrada', sev: 'error' },
  duplicate_title_tag: { label: 'Título duplicado', sev: 'error' },
  has_micromarkup_errors: { label: 'Erros de microdados', sev: 'error' },
  high_loading_time: { label: 'Carregamento lento', sev: 'warning' },
  high_waiting_time: { label: 'TTFB alto', sev: 'warning' },
  https_to_http_links: { label: 'Links HTTPS→HTTP', sev: 'warning' },
  no_image_alt: { label: 'Sem texto alt', sev: 'warning' },
  no_favicon: { label: 'Sem favicon', sev: 'warning' },
  title_too_long: { label: 'Título longo demais', sev: 'warning' },
  title_too_short: { label: 'Título curto demais', sev: 'warning' },
  low_content_rate: { label: 'Pouco texto', sev: 'warning' },
  has_render_blocking_resources: { label: 'Bloqueio de renderização', sev: 'warning' },
  large_page_size: { label: 'Página pesada', sev: 'warning' },
  low_character_count: { label: 'Poucos caracteres', sev: 'warning' },
  deprecated_html_tags: { label: 'HTML obsoleto', sev: 'warning' },
  duplicate_meta_tags: { label: 'Meta duplicada', sev: 'warning' },
  no_encoding_meta_tag: { label: 'Charset ausente', sev: 'warning' },
  irrelevant_description: { label: 'Descr. irrelevante', sev: 'warning' },
  irrelevant_title: { label: 'Título irrelevante', sev: 'warning' },
  is_https: { label: 'HTTPS', sev: 'good' },
  has_html_doctype: { label: 'DOCTYPE', sev: 'good' },
  has_micromarkup: { label: 'Dados estruturados', sev: 'good' },
  seo_friendly_url: { label: 'URL amigável', sev: 'good' },
  canonical: { label: 'Canonical definida', sev: 'info' },
  is_redirect: { label: 'Tem redirecionamento', sev: 'info' },
};

const DOMAIN_CHECKS: Record<string, string> = {
  sitemap: 'Sitemap.xml',
  robots_txt: 'Robots.txt',
  ssl: 'Certificado SSL',
  is_https: 'HTTPS',
  http2: 'HTTP/2',
  www_redirect: 'Redirecionamento WWW',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function auth(login: string, pass: string) { return `Basic ${btoa(`${login}:${pass}`)}`; }

function fmt(n?: number) { return n !== undefined && n !== null ? n.toLocaleString('pt-BR') : '—'; }

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreColor(score?: number) {
  if (!score) return 'text-nexo-faint';
  if (score >= 80) return 'text-nexo-ice';
  if (score >= 50) return 'text-nexo-warn-text';
  return 'text-nexo-danger-text';
}

function scoreBg(score?: number) {
  if (!score) return 'bg-nexo-surface-2 border-nexo-border text-nexo-dim';
  if (score >= 80) return 'bg-nexo-ice/10 border-nexo-ice/30 text-nexo-ice';
  if (score >= 50) return 'bg-nexo-warn/10 border-nexo-warn/40 text-nexo-warn-text';
  return 'bg-nexo-danger/10 border-nexo-danger/40 text-nexo-danger-text';
}

function countPageIssues(page: AuditPage) {
  if (!page.checks) return { errors: 0, warnings: 0 };
  let errors = 0, warnings = 0;
  for (const [k, v] of Object.entries(page.checks)) {
    if (!v) continue;
    const sev = PAGE_CHECKS[k]?.sev;
    if (sev === 'error') errors++;
    else if (sev === 'warning') warnings++;
  }
  return { errors, warnings };
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function createAuditTask(
  target: string, startUrl: string | undefined, maxPages: number, login: string, pass: string
): Promise<{ taskId: string; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target, max_crawl_pages: maxPages };
  if (startUrl) body.start_url = startUrl;
  const res = await fetch('https://api.dataforseo.com/v3/on_page/task_post', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { taskId: '', error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number }> };
  const task = data?.tasks?.[0];
  if (!task) return { taskId: '', error: 'Resposta vazia da API.' };
  if (task.status_code !== 20100 && task.status_code !== 20000) return { taskId: '', error: dataForSeoStatusMessage(task.status_code, task.status_message) };
  return { taskId: task.id ?? '', cost: task.cost };
}

async function fetchSummary(taskId: string, login: string, pass: string): Promise<{ summary?: SummaryResult; error?: string }> {
  const res = await fetch(`https://api.dataforseo.com/v3/on_page/summary/${taskId}`, {
    headers: { Authorization: auth(login, pass) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: SummaryResult[] }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: dataForSeoStatusMessage(task?.status_code, task?.status_message) };
  return { summary: task.result?.[0] };
}

async function fetchPages(taskId: string, login: string, pass: string): Promise<{ pages?: AuditPage[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/pages', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      id: taskId,
      limit: 1000,
      filters: [['resource_type', '=', 'html']],
    }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: AuditPage[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: dataForSeoStatusMessage(task?.status_code, task?.status_message) };
  return { pages: task.result?.[0]?.items ?? [] };
}

async function fetchKeywordDensity(taskId: string, keywordLength: number, login: string, pass: string): Promise<{ items?: KwDensityItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/keyword_density', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, keyword_length: keywordLength, limit: 200, order_by: ['frequency,desc'] }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: KwDensityItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: dataForSeoStatusMessage(task?.status_code, task?.status_message) };
  return { items: task.result?.[0]?.items ?? [] };
}

async function fetchLinks(taskId: string, login: string, pass: string): Promise<{ items?: LinkItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/links', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, limit: 1000 }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: LinkItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: dataForSeoStatusMessage(task?.status_code, task?.status_message) };
  return { items: task.result?.[0]?.items ?? [] };
}

async function fetchResources(taskId: string, login: string, pass: string): Promise<{ items?: ResourceItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/resources', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, limit: 1000 }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: ResourceItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: dataForSeoStatusMessage(task?.status_code, task?.status_message) };
  return { items: task.result?.[0]?.items ?? [] };
}

interface DuplicateTagGroup { accumulator?: string; total_count?: number; pages?: DuplicateTagPage[] }

/** DataForSEO returns one kind of duplicate per request, so titles and descriptions are fetched separately. */
async function fetchDuplicateTags(taskId: string, login: string, pass: string): Promise<{ items?: DuplicateTagItem[]; error?: string }> {
  const types = ['duplicate_title', 'duplicate_description'];
  const results = await Promise.all(types.map(async (type) => {
    const res = await fetch('https://api.dataforseo.com/v3/on_page/duplicate_tags', {
      method: 'POST',
      headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: taskId, type, limit: 200 }]),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: DuplicateTagGroup[] | null }> }> };
    const task = data?.tasks?.[0];
    if (!task || (task.status_code && task.status_code !== 20000)) return { error: dataForSeoStatusMessage(task?.status_code, task?.status_message) };
    return {
      items: (task.result?.[0]?.items ?? []).map((group): DuplicateTagItem => ({
        type, tag: group.accumulator, pages: group.pages ?? [], pages_count: group.total_count,
      })),
    };
  }));
  const failed = results.find((result) => result.error);
  if (failed) return { error: failed.error };
  return { items: results.flatMap((result) => result.items ?? []) };
}

async function fetchNonIndexable(taskId: string, login: string, pass: string): Promise<{ items?: NonIndexableItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/non_indexable', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, limit: 1000 }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: NonIndexableItem[] | null }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: dataForSeoStatusMessage(task?.status_code, task?.status_message) };
  return { items: task.result?.[0]?.items ?? [] };
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-nexo-lg border px-4 py-3 ${accent ?? 'bg-white/[0.02] border-nexo-border'}`}>
      <p className="nexo-label mb-1">{label}</p>
      <p className="text-lg font-medium text-nexo-text">{value}</p>
      {sub && <p className="text-[11px] text-nexo-faint mt-0.5">{sub}</p>}
    </div>
  );
}

function IssueRow({ label, count, sev }: { label: string; count: number; sev: Sev }) {
  const bar = sev === 'error' ? 'bg-nexo-danger' : sev === 'warning' ? 'bg-nexo-warn' : 'bg-nexo-sky/40';
  const text = sev === 'error' ? 'text-nexo-danger-text' : sev === 'warning' ? 'text-nexo-warn-text' : 'text-nexo-sky';
  return (
    <div className="flex items-center gap-3 py-2 border-b border-nexo-border last:border-0">
      <span className={`text-[10px] font-medium uppercase tracking-widest w-12 text-right tabular-nums ${text}`}>{count}</span>
      <div className="flex-1 h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, (count / 5) * 100)}%` }} />
      </div>
      <span className="text-xs text-nexo-dim flex-1">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function SiteAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const brand = getBrandSettings();
  const brandName = brand.name;
  const brandLogoUrl = brand.logo ?? undefined;
  const view = params.view ?? 'overview';
  const kwLen = parseInt(params.kw_len ?? '1', 10) || 1;

  let createError: string | null = null;

  // Step 1: create task from ?target=
  if (params.target?.trim() && !params.task_id) {
    const target = params.target.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!target) {
      createError = 'Domínio inválido.';
    } else if (!creds) {
      createError = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const maxPages = 50;
      const { taskId, cost, error } = await createAuditTask(target, undefined, maxPages, creds.login, creds.pass);
      if (error || !taskId) {
        createError = error ?? 'Falha ao criar a tarefa.';
      } else {
        upsertSiteAuditTask({ id: taskId, ts: Date.now(), target, maxCrawlPages: maxPages, status: 'pending', cost });
        redirect(`/dashboard/on-page/site-audit?task_id=${taskId}`);
      }
    }
  }

  // Step 2: load/poll task
  let activeTask: SiteAuditEntry | null = null;
  let summary: SummaryResult | null = null;
  let auditPages: AuditPage[] | null = null;
  const taskError: string | null = null;

  if (params.task_id) {
    activeTask = getSiteAuditTask(params.task_id);

    if (activeTask?.status === 'finished') {
      summary = getSiteAuditSummary<SummaryResult>(params.task_id);
      auditPages = getSiteAuditPages<AuditPage>(params.task_id);
    } else if (creds && activeTask && activeTask.status !== 'error') {
      const { summary: fetchedSummary, error: sumErr } = await fetchSummary(params.task_id, creds.login, creds.pass);
      if (sumErr) {
        // Transient failure — task is likely still queued. Keep as in_progress, don't mark error.
        activeTask = { ...activeTask, status: 'in_progress' };
        upsertSiteAuditTask(activeTask);
      } else if (fetchedSummary) {
        const pagesCrawled = fetchedSummary.crawl_status.pages_crawled;
        if (fetchedSummary.crawl_progress === 'finished') {
          const { pages, error: pagesErr } = await fetchPages(params.task_id, creds.login, creds.pass);
          if (pagesErr) {
            // Pages not ready yet — keep in_progress, user will retry
            activeTask = { ...activeTask, status: 'in_progress', pagesCrawled };
            upsertSiteAuditTask(activeTask);
          } else {
            summary = fetchedSummary;
            auditPages = pages ?? [];
            saveSiteAuditResult(params.task_id, fetchedSummary, auditPages, pagesCrawled);
            activeTask = { ...activeTask, status: 'finished', pagesCrawled };
          }
        } else {
          activeTask = { ...activeTask, status: 'in_progress', pagesCrawled };
          upsertSiteAuditTask(activeTask);
        }
      }
    }
  }

  // Keyword density — fetched live only when that tab is active
  let kwDensityItems: KwDensityItem[] | null = null;
  let kwDensityError: string | null = null;
  if (view === 'keyword_density' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchKeywordDensity(params.task_id, kwLen, creds.login, creds.pass);
    if (error) kwDensityError = error;
    else kwDensityItems = items ?? [];
  }

  let linkItems: LinkItem[] | null = null;
  let linksError: string | null = null;
  if (view === 'links' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchLinks(params.task_id, creds.login, creds.pass);
    if (error) linksError = error;
    else linkItems = items ?? [];
  }

  let resourceItems: ResourceItem[] | null = null;
  let resourcesError: string | null = null;
  if (view === 'resources' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchResources(params.task_id, creds.login, creds.pass);
    if (error) resourcesError = error;
    else resourceItems = items ?? [];
  }

  let dupTagItems: DuplicateTagItem[] | null = null;
  let dupTagsError: string | null = null;
  if (view === 'duplicate_tags' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchDuplicateTags(params.task_id, creds.login, creds.pass);
    if (error) dupTagsError = error;
    else dupTagItems = items ?? [];
  }

  let nonIndexItems: NonIndexableItem[] | null = null;
  let nonIndexError: string | null = null;
  if (view === 'non_indexable' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchNonIndexable(params.task_id, creds.login, creds.pass);
    if (error) nonIndexError = error;
    else nonIndexItems = items ?? [];
  }

  const history = getSiteAuditHistory();
  const score = summary?.page_metrics?.onpage_score;
  const isFinished = activeTask?.status === 'finished' && summary;

  // Build issues breakdown from summary checks
  const issuesList: Array<{ key: string; count: number; label: string; sev: Sev }> = [];
  if (summary?.page_metrics?.checks) {
    for (const [k, count] of Object.entries(summary.page_metrics.checks)) {
      if (!count || count === 0) continue;
      const meta = PAGE_CHECKS[k];
      if (!meta) continue;
      issuesList.push({ key: k, count, label: meta.label, sev: meta.sev });
    }
    issuesList.sort((a, b) => {
      const sevOrder: Record<Sev, number> = { error: 0, warning: 1, info: 2, good: 3 };
      if (sevOrder[a.sev] !== sevOrder[b.sev]) return sevOrder[a.sev] - sevOrder[b.sev];
      return b.count - a.count;
    });
  }

  const errors = issuesList.filter((i) => i.sev === 'error');
  const warnings = issuesList.filter((i) => i.sev === 'warning');

  // CSV for pages
  const csvData = (auditPages ?? []).map((p) => {
    const { errors: e, warnings: w } = countPageIssues(p);
    return {
      url: p.url ?? '',
      status_code: p.status_code ?? '',
      onpage_score: p.onpage_score?.toFixed(1) ?? '',
      title: p.meta?.title ?? '',
      title_length: p.meta?.title_length ?? '',
      description: p.meta?.description ?? '',
      errors: e,
      warnings: w,
      load_time_ms: p.page_timing?.duration_time ?? '',
      word_count: p.meta?.content?.plain_text_word_count ?? '',
    };
  });
  const pageExportColumns = [
    { key: 'url', label: 'URL' }, { key: 'status_code', label: 'Status' }, { key: 'onpage_score', label: 'Nota' },
    { key: 'title', label: 'Título' }, { key: 'title_length', label: 'Tamanho do título' }, { key: 'description', label: 'Descrição' },
    { key: 'errors', label: 'Erros' }, { key: 'warnings', label: 'Avisos' }, { key: 'load_time_ms', label: 'Tempo de carregamento (ms)' }, { key: 'word_count', label: 'Palavras' },
  ];
  const auditFileStem = activeTask?.target.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'site-audit';
  const auditOverviewRows = summary ? [
    { metric: 'Nota on-page', value: score?.toFixed(1) ?? '' },
    { metric: 'Páginas rastreadas', value: String(summary.crawl_status.pages_crawled) },
    { metric: 'Links quebrados', value: String(summary.page_metrics?.broken_links ?? '') },
    { metric: 'Páginas não indexáveis', value: String(summary.page_metrics?.non_indexable ?? '') },
    { metric: 'Títulos duplicados', value: String(summary.page_metrics?.duplicate_title ?? '') },
    { metric: 'Descrições duplicadas', value: String(summary.page_metrics?.duplicate_description ?? '') },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/on-page" className="hover:text-white transition-colors">On-page</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Auditoria do site</span>
        </div>
        <h1 className="nexo-h1">Auditoria do site</h1>
        <p className="text-sm text-nexo-faint mt-1">Rastreamento completo do site: nota geral, todas as páginas, problemas de SEO, SSL, sitemap e links.</p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
        btnLabel="Iniciar auditoria"
        btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Domínio alvo</label>
            <input
              type="text" name="target"
              placeholder="exemplo.com.br"
              required
              defaultValue={activeTask?.target ?? ''}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono"
            />
          </div>
        </div>
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 rounded-nexo-lg px-4 py-3">
          <p className="text-[11px] text-nexo-warn-text">
            Custo: <span className="font-medium">~US$ 0,003/página rastreada</span>. Por padrão, até 50 páginas → estimativa de <span className="font-medium">~US$ 0,15</span>.
            O rastreamento pode levar alguns minutos, conforme o tamanho do site.
          </p>
        </div>
      </SearchForm>

      {/* Errors */}
      {(createError || taskError) && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">
          {createError ?? taskError}
        </div>
      )}

      {/* Task status */}
      {params.task_id && activeTask && !taskError && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">

          {/* Task header */}
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={activeTask.status} />
                <span className="text-sm font-mono font-medium text-nexo-dim">{activeTask.target}</span>
              </div>
              <p className="text-[11px] text-nexo-faint mt-1">
                Iniciado em {formatDate(activeTask.ts)}
                {activeTask.cost !== undefined && ` · criação US$ ${activeTask.cost.toFixed(5).replace('.', ',')}`}
                {activeTask.pagesCrawled !== undefined && ` · ${activeTask.pagesCrawled} ${activeTask.pagesCrawled === 1 ? 'página rastreada' : 'páginas rastreadas'}`}
              </p>
            </div>
            {activeTask.status !== 'finished' && (
              <a href={`/dashboard/on-page/site-audit?task_id=${activeTask.id}`}
                className="nexo-section shrink-0 hover:text-white border border-nexo-border-strong hover:border-nexo-border-strong px-3 py-1.5 rounded-nexo transition-all bg-nexo-blue/10">
                Atualizar ↺
              </a>
            )}
          </div>

          {/* In progress */}
          {activeTask.status !== 'finished' && (
            <div className="px-6 py-12 text-center space-y-3">
              <AutoRefresh intervalMs={15000} />
              <div className="inline-flex items-center gap-2 text-sm text-nexo-dim">
                <span className="inline-block w-4 h-4 border-2 border-nexo-sky border-t-transparent rounded-full animate-spin" />
                Rastreamento em andamento…
              </div>
              {activeTask.pagesCrawled !== undefined && (
                <p className="text-xs text-nexo-faint">{activeTask.pagesCrawled} / {activeTask.maxCrawlPages} páginas rastreadas</p>
              )}
              <p className="text-xs text-nexo-faint">Verificando automaticamente a cada 15 segundos.</p>
            </div>
          )}

          {/* Results: tab navigation */}
          {isFinished && (
            <>
              <div className="px-4 pt-3 flex gap-0.5 flex-wrap border-b border-nexo-border overflow-x-auto">
                {([
                  ['overview',       'Visão geral'],
                  ['pages',          `Páginas (${auditPages?.length ?? 0})`],
                  ['links',          'Links'],
                  ['resources',      'Recursos'],
                  ['duplicate_tags', 'Tags dup.'],
                  ['non_indexable',  'Não indexáveis'],
                  ['keyword_density','Densidade de palavras-chave'],
                ] as const).map(([t, label]) => (
                  <a key={t} href={`/dashboard/on-page/site-audit?task_id=${activeTask!.id}&view=${t}`}
                    className={`px-3 py-2 text-[11px] font-medium uppercase tracking-widest rounded-t-nexo transition-colors whitespace-nowrap ${
                      view === t
                        ? 'bg-nexo-surface-2 text-white'
                        : 'text-nexo-faint hover:text-white'
                    }`}>
                    {label}
                  </a>
                ))}
              </div>

              {/* ── Overview tab ── */}
              {view === 'overview' && summary && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between gap-4 border-b border-nexo-border pb-4">
                    <p className="nexo-label">Exportar relatório da auditoria</p>
                    <div className="flex items-center gap-3">
                      <ReportPdfExportButton brandName={brandName} brandLogoUrl={brandLogoUrl} brandColor={brand.color} brandFooter={brand.footer} brandStyle={brand} filename={`${auditFileStem}-site-audit-report.pdf`}
                        title="Relatório de auditoria do site" subject={activeTask!.target} generatedAt={activeTask!.ts}
                        metrics={[
                          { label: 'Nota on-page', value: score?.toFixed(1) ?? '—', detail: 'de 100' },
                          { label: 'Páginas rastreadas', value: fmt(summary.crawl_status.pages_crawled), detail: `máximo de ${fmt(summary.crawl_status.max_crawl_pages)}` },
                          { label: 'Erros críticos', value: String(errors.reduce((total, issue) => total + issue.count, 0)), detail: `${errors.length} ${errors.length === 1 ? 'tipo de problema' : 'tipos de problema'}` },
                          { label: 'Avisos', value: String(warnings.reduce((total, issue) => total + issue.count, 0)), detail: `${warnings.length} ${warnings.length === 1 ? 'tipo de problema' : 'tipos de problema'}` },
                        ]}
                        sections={[
                          { title: 'Problemas críticos', rows: errors.slice(0, 15).map((issue) => [issue.label, `${issue.count} ${issue.count === 1 ? 'página' : 'páginas'}`]) },
                          { title: 'Avisos', rows: warnings.slice(0, 15).map((issue) => [issue.label, `${issue.count} ${issue.count === 1 ? 'página' : 'páginas'}`]) },
                          { title: 'Saúde do domínio', rows: [[ 'CMS', summary.domain_info?.cms ?? '—' ], [ 'Servidor', summary.domain_info?.server ?? '—' ], [ 'Certificado SSL', summary.domain_info?.ssl_info?.valid_certificate ? 'Válido' : 'Não verificado' ]].filter((row) => row[1] !== '—') as Array<[string, string]> },
                        ]} />
                      <ExportExcelButton filename={`${auditFileStem}-site-audit.xls`} sheets={[
                        { name: 'Visão geral', columns: [{ key: 'metric', label: 'Métrica' }, { key: 'value', label: 'Valor' }], data: auditOverviewRows },
                        { name: 'Problemas', columns: [{ key: 'severity', label: 'Gravidade' }, { key: 'issue', label: 'Problema' }, { key: 'pages', label: 'Páginas afetadas' }], data: issuesList.map((issue) => ({ severity: issue.sev === 'error' ? 'Erro' : issue.sev === 'warning' ? 'Aviso' : issue.sev === 'good' ? 'Ok' : 'Info', issue: issue.label, pages: issue.count })) },
                        { name: 'Páginas', columns: pageExportColumns, data: csvData },
                      ]} />
                      <ExportCSVButton data={csvData} columns={pageExportColumns} filename={`${auditFileStem}-site-audit-pages.csv`} />
                    </div>
                  </div>
                  {/* Score + crawl stats */}
                  <div className="flex gap-4 items-start flex-wrap">
                    {score !== undefined && (
                      <div className={`shrink-0 rounded-nexo-lg border-2 px-8 py-5 text-center ${scoreBg(score)}`}>
                        <p className="nexo-label mb-1">Nota OnPage</p>
                        <p className={`text-4xl font-medium ${scoreColor(score)}`}>{score.toFixed(1)}</p>
                        <p className="text-[11px] text-nexo-faint">/ 100</p>
                      </div>
                    )}
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <StatCard label="Páginas rastreadas" value={fmt(summary.crawl_status.pages_crawled)} sub={`/ máx. ${fmt(summary.crawl_status.max_crawl_pages)}`} />
                      {summary.page_metrics?.broken_links !== undefined && (
                        <StatCard label="Links quebrados" value={fmt(summary.page_metrics.broken_links)}
                          accent={summary.page_metrics.broken_links > 0 ? 'bg-nexo-danger/10 border-nexo-danger/40' : 'bg-nexo-ice/10 border-nexo-ice/30'} />
                      )}
                      {summary.page_metrics?.non_indexable !== undefined && (
                        <StatCard label="Não indexáveis" value={fmt(summary.page_metrics.non_indexable)} />
                      )}
                      {summary.page_metrics?.duplicate_title !== undefined && (
                        <StatCard label="Títulos duplicados" value={fmt(summary.page_metrics.duplicate_title)} />
                      )}
                      {summary.page_metrics?.duplicate_description !== undefined && (
                        <StatCard label="Descrições duplicadas" value={fmt(summary.page_metrics.duplicate_description)} />
                      )}
                      {summary.page_metrics?.internal_links_count !== undefined && (
                        <StatCard label="Links internos" value={fmt(summary.page_metrics.internal_links_count)} />
                      )}
                    </div>
                  </div>

                  {/* Domain health */}
                  {summary.domain_info && (
                    <div>
                      <h3 className="nexo-label mb-3">Saúde do domínio</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {summary.domain_info.server && (
                          <div className="bg-white/[0.02] rounded-nexo-lg border border-nexo-border px-4 py-3">
                            <p className="nexo-label">Servidor</p>
                            <p className="text-sm font-mono font-medium text-nexo-dim mt-0.5">{summary.domain_info.server}</p>
                          </div>
                        )}
                        {summary.domain_info.cms && (
                          <div className="bg-white/[0.02] rounded-nexo-lg border border-nexo-border px-4 py-3">
                            <p className="nexo-label">CMS</p>
                            <p className="text-sm font-medium text-nexo-dim mt-0.5">{summary.domain_info.cms}</p>
                          </div>
                        )}
                        {summary.domain_info.ip && (
                          <div className="bg-white/[0.02] rounded-nexo-lg border border-nexo-border px-4 py-3">
                            <p className="nexo-label">IP</p>
                            <p className="text-sm font-mono text-nexo-dim mt-0.5">{summary.domain_info.ip}</p>
                          </div>
                        )}
                        {summary.domain_info.ssl_info && (
                          <div className={`rounded-nexo-lg border px-4 py-3 ${summary.domain_info.ssl_info.valid_certificate ? 'bg-nexo-ice/10 border-nexo-ice/30' : 'bg-nexo-danger/10 border-nexo-danger/40'}`}>
                            <p className="nexo-label">SSL</p>
                            <p className={`text-sm font-medium mt-0.5 ${summary.domain_info.ssl_info.valid_certificate ? 'text-nexo-ice' : 'text-nexo-danger-text'}`}>
                              {summary.domain_info.ssl_info.valid_certificate ? '✓ Válido' : '✕ Inválido'}
                            </p>
                            {summary.domain_info.ssl_info.certificate_expiration_date && (
                              <p className="text-[10px] text-nexo-faint mt-0.5">Expira: {summary.domain_info.ssl_info.certificate_expiration_date.slice(0, 10)}</p>
                            )}
                          </div>
                        )}
                        {summary.domain_info.checks && Object.entries(DOMAIN_CHECKS).map(([k, label]) => {
                          const val = summary!.domain_info!.checks![k];
                          if (val === undefined) return null;
                          return (
                            <div key={k} className={`rounded-nexo-lg border px-4 py-3 ${val ? 'bg-nexo-ice/10 border-nexo-ice/30' : 'bg-white/[0.02] border-nexo-border'}`}>
                              <p className="nexo-label">{label}</p>
                              <p className={`text-sm font-medium mt-0.5 ${val ? 'text-nexo-ice' : 'text-nexo-dim'}`}>{val ? '✓ Presente' : '✕ Ausente'}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {issuesList.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {errors.length > 0 && (
                        <div>
                          <h3 className="text-[10px] font-medium uppercase tracking-widest text-nexo-danger-text mb-3">Erros críticos</h3>
                          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-4 py-2">
                            {errors.map((i) => <IssueRow key={i.key} label={i.label} count={i.count} sev={i.sev} />)}
                          </div>
                        </div>
                      )}
                      {warnings.length > 0 && (
                        <div>
                          <h3 className="text-[10px] font-medium uppercase tracking-widest text-nexo-warn-text mb-3">Avisos</h3>
                          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-4 py-2">
                            {warnings.slice(0, 15).map((i) => <IssueRow key={i.key} label={i.label} count={i.count} sev={i.sev} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Keyword Density tab ── */}
              {view === 'keyword_density' && (
                <div>
                  {/* N-gram selector */}
                  <div className="px-6 py-3 border-b border-nexo-border flex items-center gap-2">
                    <span className="nexo-label mr-2">N-gram</span>
                    {[1, 2, 3].map((n) => (
                      <a key={n}
                        href={`/dashboard/on-page/site-audit?task_id=${activeTask!.id}&view=keyword_density&kw_len=${n}`}
                        className={`px-3 py-1 text-[11px] font-medium uppercase tracking-widest rounded-nexo border transition-colors ${
                          kwLen === n
                            ? 'bg-nexo-surface-2 text-white border-nexo-border-strong'
                            : 'text-nexo-faint border-nexo-border hover:border-nexo-border-strong'
                        }`}>
                        {n === 1 ? 'Unigrama' : n === 2 ? 'Bigrama' : 'Trigrama'}
                      </a>
                    ))}
                    {kwDensityItems && (
                      <span className="ml-auto text-[11px] text-nexo-faint">{kwDensityItems.length} {kwDensityItems.length === 1 ? 'palavra-chave' : 'palavras-chave'}</span>
                    )}
                  </div>

                  {kwDensityError && (
                    <div className="px-6 py-4 text-sm text-nexo-danger-text">{kwDensityError}</div>
                  )}

                  {!kwDensityItems && !kwDensityError && (
                    <div className="px-6 py-12 text-center text-sm text-nexo-faint">Carregando…</div>
                  )}

                  {kwDensityItems && kwDensityItems.length === 0 && (
                    <div className="px-6 py-12 text-center text-sm text-nexo-faint">Sem dados de densidade de palavras-chave: esta auditoria foi rastreada sem a opção de densidade de palavras-chave da DataForSEO.</div>
                  )}

                  {kwDensityItems && kwDensityItems.length > 0 && (
                    <KeywordDensityTable items={kwDensityItems} />
                  )}
                </div>
              )}

              {/* ── Pages tab ── */}
              {view === 'pages' && auditPages && (
                <div>
                  <div className="px-6 py-3 border-b border-nexo-border flex items-center justify-between">
                    <span className="text-xs font-medium text-nexo-faint">{auditPages.length} {auditPages.length !== 1 ? 'páginas' : 'página'} HTML</span>
                    {auditPages.length > 0 && (
                      <div className="flex items-center gap-2">
                        <CopyMarkdownButton
                          data={csvData}
                          columns={pageExportColumns}
                        />
                        <ExportCSVButton
                          data={csvData}
                          filename={`site-audit-${activeTask!.target}.csv`}
                          columns={pageExportColumns}
                        />
                      </div>
                    )}
                  </div>
                  {auditPages.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhuma página HTML encontrada.</div>
                  ) : (
                    <SiteAuditPagesTable pages={auditPages} />
                  )}
                </div>
              )}
              {/* ── Links tab ── */}
              {view === 'links' && (
                <div>
                  {linksError && <div className="px-6 py-4 text-sm text-nexo-danger-text">{linksError}</div>}
                  {!linkItems && !linksError && <div className="px-6 py-12 text-center text-sm text-nexo-faint">Carregando…</div>}
                  {linkItems && (
                    linkItems.length === 0 ? (
                      <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum link encontrado.</div>
                    ) : (
                      <LinksTable links={linkItems} />
                    )
                  )}
                </div>
              )}

              {/* ── Resources tab ── */}
              {view === 'resources' && (
                <div>
                  {resourcesError && <div className="px-6 py-4 text-sm text-nexo-danger-text">{resourcesError}</div>}
                  {!resourceItems && !resourcesError && <div className="px-6 py-12 text-center text-sm text-nexo-faint">Carregando…</div>}
                  {resourceItems && (
                    resourceItems.length === 0 ? (
                      <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum recurso encontrado.</div>
                    ) : (
                      <ResourcesTable resources={resourceItems} />
                    )
                  )}
                </div>
              )}

              {/* ── Duplicate Tags tab ── */}
              {view === 'duplicate_tags' && (
                <div>
                  {dupTagsError && <div className="px-6 py-4 text-sm text-nexo-danger-text">{dupTagsError}</div>}
                  {!dupTagItems && !dupTagsError && <div className="px-6 py-12 text-center text-sm text-nexo-faint">Carregando…</div>}
                  {dupTagItems && dupTagItems.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <p className="text-nexo-ice font-medium text-sm">Nenhuma tag duplicada encontrada.</p>
                      <p className="text-nexo-faint text-xs mt-1">Todas as páginas têm tags de título e descrição únicas.</p>
                    </div>
                  )}
                  {dupTagItems && dupTagItems.length > 0 && (
                    <div className="divide-y divide-nexo-border">
                      {dupTagItems.map((group, i) => (
                        <div key={i} className="px-6 py-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded bg-nexo-danger/10 text-nexo-danger-text border border-nexo-danger/40">
                              {group.type === 'duplicate_title' ? 'Título duplicado' : 'Descrição duplicada'}
                            </span>
                            <span className="text-[11px] text-nexo-faint">{group.pages?.length ?? 0} {(group.pages?.length ?? 0) === 1 ? 'página' : 'páginas'}</span>
                          </div>
                          {group.tag && (
                            <p className="text-xs font-mono text-nexo-dim bg-white/[0.02] px-3 py-2 rounded-nexo mb-3 truncate">
                              &ldquo;{group.tag}&rdquo;
                            </p>
                          )}
                          <div className="space-y-1">
                            {group.pages?.map((page, pi) => (
                              <a key={pi} href={page.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[11px] font-mono text-nexo-sky hover:underline truncate block">
                                {page.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Non-indexable tab ── */}
              {view === 'non_indexable' && (
                <div>
                  {nonIndexError && <div className="px-6 py-4 text-sm text-nexo-danger-text">{nonIndexError}</div>}
                  {!nonIndexItems && !nonIndexError && <div className="px-6 py-12 text-center text-sm text-nexo-faint">Carregando…</div>}
                  {nonIndexItems && nonIndexItems.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <p className="text-nexo-ice font-medium text-sm">Nenhuma página não indexável encontrada.</p>
                      <p className="text-nexo-faint text-xs mt-1">Todas as páginas rastreadas parecem ser indexáveis.</p>
                    </div>
                  )}
                  {nonIndexItems && nonIndexItems.length > 0 && (
                    <NonIndexableTable pages={nonIndexItems} />
                  )}
                </div>
              )}

            </>
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
              const isActive = entry.id === params.task_id;
              return (
                <a key={entry.id} href={`/dashboard/on-page/site-audit?task_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={entry.status} />
                      <p className={`text-sm font-medium truncate font-mono ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>
                        {entry.target}
                      </p>
                    </div>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {entry.pagesCrawled !== undefined ? `${entry.pagesCrawled} ${entry.pagesCrawled === 1 ? 'página rastreada' : 'páginas rastreadas'}` : `máx. ${entry.maxCrawlPages}`}
                      {entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(5).replace('.', ',')}` : ''}
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

function StatusBadge({ status }: { status: SiteAuditEntry['status'] }) {
  const map: Record<SiteAuditEntry['status'], string> = {
    pending: 'text-nexo-faint bg-nexo-surface-2',
    in_progress: 'text-nexo-sky bg-nexo-blue/10 border border-nexo-border-strong',
    finished: 'text-nexo-ice bg-nexo-ice/10 border border-nexo-ice/30',
    error: 'text-nexo-danger-text bg-nexo-danger/10 border border-nexo-danger/40',
  };
  const labels: Record<SiteAuditEntry['status'], string> = {
    pending: 'Pendente', in_progress: 'Em andamento', finished: 'Concluído', error: 'Erro',
  };
  return <span className={`text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-md ${map[status]}`}>{labels[status]}</span>;
}

export default withProjectScope(SiteAuditPage);
