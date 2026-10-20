import { withProjectScope } from '@/lib/db';
import { getCredentials, getInstantPageHistory, saveInstantPageResult, getInstantPageResult, type InstantPageEntry } from '@/lib/db';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { redirect } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HTag {
  [tag: string]: string[] | undefined;
}

interface PageMeta {
  title?: string;
  description?: string;
  canonical?: string;
  meta_keywords?: string;
  meta_title?: string;
  generator?: string;
  charset?: number;
  htags?: HTag;
  follow?: boolean;
  internal_links_count?: number;
  external_links_count?: number;
  inbound_links_count?: number;
  images_count?: number;
  images_size?: number;
  scripts_count?: number;
  scripts_size?: number;
  stylesheets_count?: number;
  stylesheets_size?: number;
  title_length?: number;
  description_length?: number;
  render_blocking_scripts_count?: number;
  render_blocking_stylesheets_count?: number;
  cumulative_layout_shift?: number;
  total_dom_size?: number;
}

interface PageTiming {
  time_to_interactive?: number;
  dom_complete?: number;
  largest_contentful_paint?: number;
  first_input_delay?: number;
  connection_time?: number;
  time_to_secure_connection?: number;
  waiting_time?: number;
  download_time?: number;
  duration_time?: number;
}

interface ContentMetrics {
  plain_text_size?: number;
  plain_text_rate?: number;
  plain_text_word_count?: number;
  automated_readability_index?: number;
  flesch_kincaid_readability_index?: number;
  dale_chall_readability_index?: number;
  description_to_content_consistency?: number;
  title_to_content_consistency?: number;
}

interface Checks {
  [key: string]: boolean | undefined;
}

interface PageItem {
  resource_type?: string;
  url?: string;
  status_code?: number;
  onpage_score?: number;
  size?: number;
  encoded_size?: number;
  total_transfer_size?: number;
  fetch_time?: string;
  content_encoding?: string;
  media_type?: string;
  server?: string;
  is_https?: boolean;
  url_length?: number;
  meta?: PageMeta;
  page_timing?: PageTiming;
  content?: ContentMetrics;
  checks?: Checks;
  broken_resources?: boolean;
  broken_links?: boolean;
}

interface ApiResult {
  items?: PageItem[];
  items_count?: number;
}

interface SearchParams {
  url?: string;
  id?: string;
}

// ─── Checks metadata ──────────────────────────────────────────────────────────

type CheckSeverity = 'error' | 'warning' | 'info' | 'good';

const CHECK_META: Record<string, { label: string; severity: CheckSeverity }> = {
  no_title: { label: 'Tag de título ausente', severity: 'error' },
  no_description: { label: 'Meta description ausente', severity: 'error' },
  no_h1_tag: { label: 'Tag H1 ausente', severity: 'error' },
  duplicate_title_tag: { label: 'Tags de título duplicadas', severity: 'error' },
  is_4xx_code: { label: 'Código de status 4XX', severity: 'error' },
  is_5xx_code: { label: 'Código de status 5XX', severity: 'error' },
  is_broken: { label: 'Página quebrada', severity: 'error' },
  no_doctype: { label: 'DOCTYPE ausente', severity: 'error' },
  has_micromarkup_errors: { label: 'Erros de microdados', severity: 'error' },
  high_loading_time: { label: 'Tempo de carregamento alto (>3s)', severity: 'warning' },
  high_waiting_time: { label: 'TTFB alto (>1,5s)', severity: 'warning' },
  https_to_http_links: { label: 'Página HTTPS com links para HTTP', severity: 'warning' },
  no_image_alt: { label: 'Imagens sem texto alt', severity: 'warning' },
  no_image_title: { label: 'Imagens sem atributo title', severity: 'warning' },
  no_favicon: { label: 'Sem favicon', severity: 'warning' },
  title_too_long: { label: 'Título longo demais (>65 caracteres)', severity: 'warning' },
  title_too_short: { label: 'Título curto demais (<30 caracteres)', severity: 'warning' },
  low_content_rate: { label: 'Proporção texto/tamanho baixa', severity: 'warning' },
  high_content_rate: { label: 'Proporção texto/tamanho alta', severity: 'warning' },
  has_render_blocking_resources: { label: 'Recursos que bloqueiam a renderização', severity: 'warning' },
  size_greater_than_3mb: { label: 'Página > 3 MB', severity: 'warning' },
  large_page_size: { label: 'Página pesada (>1 MB)', severity: 'warning' },
  low_character_count: { label: 'Poucos caracteres (<1024)', severity: 'warning' },
  deprecated_html_tags: { label: 'Tags HTML obsoletas', severity: 'warning' },
  duplicate_meta_tags: { label: 'Meta tags duplicadas', severity: 'warning' },
  no_encoding_meta_tag: { label: 'Meta tag charset ausente', severity: 'warning' },
  has_meta_refresh_redirect: { label: 'Redirecionamento por meta refresh', severity: 'warning' },
  flash: { label: 'Elementos Flash detectados', severity: 'warning' },
  frame: { label: 'Elementos frame/iframe', severity: 'warning' },
  lorem_ipsum: { label: 'Texto lorem ipsum encontrado', severity: 'warning' },
  has_misspelling: { label: 'Erros de ortografia', severity: 'warning' },
  irrelevant_description: { label: 'Descrição sem relação com o conteúdo', severity: 'warning' },
  irrelevant_title: { label: 'Título sem relação com o conteúdo', severity: 'warning' },
  is_https: { label: 'HTTPS', severity: 'good' },
  has_html_doctype: { label: 'DOCTYPE HTML presente', severity: 'good' },
  has_micromarkup: { label: 'Dados estruturados presentes', severity: 'good' },
  seo_friendly_url: { label: 'URL amigável para SEO', severity: 'good' },
  is_redirect: { label: 'Contém redirecionamento (3XX)', severity: 'info' },
  is_www: { label: 'Subdomínio WWW', severity: 'info' },
  is_http: { label: 'HTTP (sem HTTPS)', severity: 'info' },
  canonical: { label: 'Tag canonical definida', severity: 'info' },
  has_meta_title: { label: 'Tag meta title presente', severity: 'info' },
  seo_friendly_url_characters_check: { label: 'URL usa caracteres válidos', severity: 'info' },
  seo_friendly_url_dynamic_check: { label: 'Sem parâmetros dinâmicos na URL', severity: 'info' },
  seo_friendly_url_keywords_check: { label: 'URL corresponde às palavras-chave do título', severity: 'info' },
  seo_friendly_url_relative_length_check: { label: 'URL com menos de 120 caracteres', severity: 'info' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreColor(score?: number): string {
  if (!score) return 'text-nexo-faint';
  if (score >= 80) return 'text-nexo-ice';
  if (score >= 50) return 'text-nexo-warn-text';
  return 'text-nexo-danger-text';
}

function scoreBg(score?: number): string {
  if (!score) return 'bg-nexo-surface-2';
  if (score >= 80) return 'bg-nexo-ice/10 border-nexo-ice/30';
  if (score >= 50) return 'bg-nexo-warn/10 border-nexo-warn/40';
  return 'bg-nexo-danger/10 border-nexo-danger/40';
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchInstantPage(url: string, login: string, pass: string): Promise<{ result?: ApiResult; cost?: number; error?: string }> {
  return callDataForSeoFirst<ApiResult>(
    'on_page/instant_pages', { url, load_resources: false, enable_javascript: false }, { login, pass },
  );
}

// ─── UI components ────────────────────────────────────────────────────────────

function MetaRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex gap-3 py-2.5 border-b border-nexo-border last:border-0">
      <span className="nexo-label w-40 shrink-0 mt-0.5">{label}</span>
      <span className={`text-sm text-nexo-text break-all leading-relaxed ${mono ? 'font-mono text-xs' : ''}`}>{String(value)}</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/[0.02] rounded-nexo-lg border border-nexo-border px-4 py-3">
      <p className="nexo-label mb-1">{label}</p>
      <p className="text-lg font-medium text-nexo-text">{value}</p>
      {sub && <p className="text-[11px] text-nexo-faint mt-0.5">{sub}</p>}
    </div>
  );
}

function CheckBadge({ severity, label }: { severity: CheckSeverity; label: string }) {
  const cls: Record<CheckSeverity, string> = {
    error: 'text-nexo-danger-text bg-nexo-danger/10 border-nexo-danger/40',
    warning: 'text-nexo-warn-text bg-nexo-warn/10 border-nexo-warn/40',
    info: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
    good: 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-nexo border ${cls[severity]}`}>
      {severity === 'error' && '✕ '}
      {severity === 'warning' && '⚠ '}
      {severity === 'good' && '✓ '}
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function InstantPagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;

  let createError: string | null = null;

  // Step 1: submit ?url= → call API → save → redirect to ?id=
  if (params.url?.trim() && !params.id) {
    let rawUrl = params.url.trim();
    if (!rawUrl.startsWith('http')) rawUrl = `https://${rawUrl}`;
    let validUrl = false;
    try { new URL(rawUrl); validUrl = true; } catch { /* noop */ }

    if (!validUrl) {
      createError = 'URL inválida.';
    } else if (!creds) {
      createError = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const { result, cost, error } = await fetchInstantPage(rawUrl, creds.login, creds.pass);
      if (error || !result) {
        createError = error ?? 'A chamada à API falhou.';
      } else {
        const id = randomUUID();
        saveInstantPageResult<ApiResult>({ id, ts: Date.now(), url: rawUrl, cost }, result);
        redirect(`/dashboard/on-page/instant-pages?id=${id}`);
      }
    }
  }

  // Step 2: load cached result from ?id=
  let activeEntry: InstantPageEntry | null = null;
  let pageResult: ApiResult | null = null;

  if (params.id) {
    const history = getInstantPageHistory();
    activeEntry = history.find((e) => e.id === params.id) ?? null;
    pageResult = getInstantPageResult<ApiResult>(params.id);
  }

  const history = getInstantPageHistory();
  const page = pageResult?.items?.[0];

  const flaggedChecks = page?.checks
    ? Object.entries(page.checks).filter(([, val]) => val === true)
    : [];

  const errors = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'error');
  const warnings = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'warning');
  const goods = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'good');
  const infos = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'info');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <span>On-page</span><span className="text-nexo-text">/</span><span className="text-nexo-dim">Páginas instantâneas</span>
        </div>
        <h1 className="nexo-h1">Análise instantânea de página</h1>
        <p className="text-sm text-nexo-faint mt-1">Auditoria on-page completa de uma URL: metadados, desempenho, verificações e métricas de conteúdo.</p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-3"
        btnLabel="Analisar"
        btnClassName="nexo-label w-full bg-white text-nexo-bg py-2.5 rounded-nexo-lg hover:bg-nexo-ice transition-colors"
      >
        <label className="nexo-label block mb-1.5">URL da página</label>
        <input
          type="url"
          name="url"
          placeholder="https://exemplo.com.br/pagina"
          required
          defaultValue={activeEntry?.url ?? ''}
          className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono"
        />
      </SearchForm>

      {/* Error */}
      {createError && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{createError}</div>
      )}

      {/* Results */}
      {activeEntry && pageResult && page && (
        <div className="space-y-4">
          {/* Entry header */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs font-mono text-nexo-dim truncate max-w-lg">{activeEntry.url}</p>
              <p className="text-[11px] text-nexo-faint mt-1">
                {formatDate(activeEntry.ts)}
                {activeEntry.cost !== undefined && ` · US$ ${activeEntry.cost.toFixed(5).replace('.', ',')}`}
                {page.status_code !== undefined && ` · HTTP ${page.status_code}`}
                {page.server && ` · ${page.server}`}
              </p>
            </div>
            {/* OnPage score */}
            {page.onpage_score !== undefined && (
              <div className={`shrink-0 rounded-nexo-lg border px-5 py-3 text-center ${scoreBg(page.onpage_score)}`}>
                <p className="nexo-label mb-0.5">Nota OnPage</p>
                <p className={`text-3xl font-medium ${scoreColor(page.onpage_score)}`}>{page.onpage_score.toFixed(1)}</p>
                <p className="text-[10px] text-nexo-faint">/ 100</p>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Tamanho da página" value={formatBytes(page.size)} sub={page.total_transfer_size ? `${formatBytes(page.total_transfer_size)} comprimido` : undefined} />
            <StatCard label="Tamanho da URL" value={page.url_length ?? '—'} sub="caracteres" />
            <StatCard label="Links internos" value={page.meta?.internal_links_count ?? '—'} />
            <StatCard label="Links externos" value={page.meta?.external_links_count ?? '—'} />
          </div>

          {/* Checks */}
          {flaggedChecks.length > 0 && (
            <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Verificações</h2>
              </div>
              <div className="px-6 py-5 space-y-4">
                {errors.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-nexo-danger-text mb-2">Erros</p>
                    <div className="flex flex-wrap gap-2">
                      {errors.map(([k]) => <CheckBadge key={k} severity="error" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
                {warnings.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-nexo-warn-text mb-2">Avisos</p>
                    <div className="flex flex-wrap gap-2">
                      {warnings.map(([k]) => <CheckBadge key={k} severity="warning" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
                {goods.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice mb-2">Ok</p>
                    <div className="flex flex-wrap gap-2">
                      {goods.map(([k]) => <CheckBadge key={k} severity="good" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
                {infos.length > 0 && (
                  <div>
                    <p className="nexo-section mb-2">Informações</p>
                    <div className="flex flex-wrap gap-2">
                      {infos.map(([k]) => <CheckBadge key={k} severity="info" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border">
              <h2 className="nexo-label">Metadados da página</h2>
            </div>
            <div className="px-6 py-2">
              <MetaRow label="Título" value={page.meta?.title} />
              {page.meta?.title_length !== undefined && (
                <MetaRow label="Tamanho do título" value={`${page.meta.title_length} caracteres`} />
              )}
              <MetaRow label="Descrição" value={page.meta?.description} />
              {page.meta?.description_length !== undefined && (
                <MetaRow label="Tamanho da descr." value={`${page.meta.description_length} caracteres`} />
              )}
              <MetaRow label="Canonical" value={page.meta?.canonical} mono />
              <MetaRow label="Meta title" value={page.meta?.meta_title} />
              <MetaRow label="Meta keywords" value={page.meta?.meta_keywords} />
              <MetaRow label="Gerador" value={page.meta?.generator} />
              <MetaRow label="Charset" value={page.meta?.charset} />
              <MetaRow label="Nós do DOM" value={page.meta?.total_dom_size} />
            </div>
          </div>

          {/* Headings */}
          {page.meta?.htags && Object.keys(page.meta.htags).length > 0 && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Títulos (headings)</h2>
              </div>
              <div className="px-6 py-4 space-y-3">
                {(['h1', 'h2', 'h3', 'h4'] as const).map((tag) => {
                  const values = page.meta?.htags?.[tag];
                  if (!values?.length) return null;
                  return (
                    <div key={tag}>
                      <span className="nexo-label mr-2">{tag.toUpperCase()}</span>
                      <span className="text-[10px] text-nexo-faint mr-3">({values.length})</span>
                      <div className="mt-1.5 space-y-1">
                        {values.slice(0, 5).map((v, i) => (
                          <p key={i} className="text-sm text-nexo-dim pl-2 border-l-2 border-nexo-border">{v}</p>
                        ))}
                        {values.length > 5 && <p className="text-xs text-nexo-faint pl-2">+{values.length - 5} mais</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance */}
          {page.page_timing && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Desempenho</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
                <StatCard label="LCP" value={formatMs(page.page_timing.largest_contentful_paint)} sub="Largest Contentful Paint" />
                <StatCard label="TTFB" value={formatMs(page.page_timing.waiting_time)} sub="Time to First Byte" />
                <StatCard label="TTI" value={formatMs(page.page_timing.time_to_interactive)} sub="Time to Interactive" />
                <StatCard label="Total" value={formatMs(page.page_timing.duration_time)} sub="Tempo total de carregamento" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 pb-4">
                <StatCard label="DOM completo" value={formatMs(page.page_timing.dom_complete)} />
                <StatCard label="Download" value={formatMs(page.page_timing.download_time)} />
                <StatCard label="Conexão" value={formatMs(page.page_timing.connection_time)} />
                <StatCard label="TLS" value={formatMs(page.page_timing.time_to_secure_connection)} sub="Conexão segura" />
              </div>
            </div>
          )}

          {/* Resources */}
          {page.meta && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Recursos</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-6 py-4">
                <StatCard label="Imagens" value={page.meta.images_count ?? '—'} sub={formatBytes(page.meta.images_size)} />
                <StatCard label="Scripts" value={page.meta.scripts_count ?? '—'} sub={formatBytes(page.meta.scripts_size)} />
                <StatCard label="Folhas de estilo" value={page.meta.stylesheets_count ?? '—'} sub={formatBytes(page.meta.stylesheets_size)} />
                {page.meta.render_blocking_scripts_count !== undefined && (
                  <StatCard label="Scripts bloqueantes" value={page.meta.render_blocking_scripts_count} />
                )}
                {page.meta.render_blocking_stylesheets_count !== undefined && (
                  <StatCard label="CSS bloqueante" value={page.meta.render_blocking_stylesheets_count} />
                )}
                {page.meta.cumulative_layout_shift !== undefined && (
                  <StatCard label="CLS" value={page.meta.cumulative_layout_shift.toFixed(3)} sub="Cumulative Layout Shift" />
                )}
              </div>
            </div>
          )}

          {/* Content */}
          {page.content && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Métricas de conteúdo</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
                {page.content.plain_text_word_count !== undefined && (
                  <StatCard label="Palavras" value={Math.round(page.content.plain_text_word_count)} />
                )}
                {page.content.plain_text_size !== undefined && (
                  <StatCard label="Tamanho do texto" value={formatBytes(page.content.plain_text_size)} />
                )}
                {page.content.plain_text_rate !== undefined && (
                  <StatCard label="Taxa de texto" value={`${page.content.plain_text_rate}%`} sub="Texto / tamanho da página" />
                )}
                {page.content.flesch_kincaid_readability_index !== undefined && (
                  <StatCard label="Flesch-Kincaid" value={page.content.flesch_kincaid_readability_index.toFixed(1)} sub="Legibilidade" />
                )}
                {page.content.title_to_content_consistency !== undefined && (
                  <StatCard label="Coerência do título" value={`${(page.content.title_to_content_consistency * 100).toFixed(0)}%`} sub="Título ↔ conteúdo" />
                )}
                {page.content.description_to_content_consistency !== undefined && (
                  <StatCard label="Coerência da descr." value={`${(page.content.description_to_content_consistency * 100).toFixed(0)}%`} sub="Descrição ↔ conteúdo" />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No result yet */}
      {params.id && !pageResult && !createError && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center text-sm text-nexo-faint">
          Resultado não encontrado.
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Histórico de análises</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === params.id;
              return (
                <a
                  key={entry.id}
                  href={`/dashboard/on-page/instant-pages?id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>
                      {new URL(entry.url).hostname}
                    </p>
                    <p className="text-[11px] text-nexo-faint mt-0.5 truncate font-mono">{entry.url}</p>
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

export default withProjectScope(InstantPagesPage);
