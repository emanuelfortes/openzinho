import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getSetting,
  getAiVisibilityHistory,
  saveAiVisibilitySearch,
  getAiVisibilityResult,
  type AiVisibilityEntry,
  type AiVisibilityMode,
} from '@/lib/db';
import { labsLocationLabel, toLabsCountry } from '@/lib/geo-options';
import { getBrandSettings } from '@/lib/brand-server';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import ExportExcelButton, { type ExportSheet } from '@/components/ExportExcelButton';
import ReportPdfExportButton, { type ReportMetric, type ReportSection } from '@/components/ReportPdfExportButton';
import LeaderboardTables from './LeaderboardTables';
import HistoricalTargetingFields from './HistoricalTargetingFields';
import MentionTargetingFields from './MentionTargetingFields';

// ---- Types ----

export interface AggMetric {
  key: string | number;
  mentions: number;
  ai_search_volume: number;
}

export interface AggregatedMetrics {
  location?: AggMetric[];
  language?: AggMetric[];
  platform?: AggMetric[];
  sources_domain?: AggMetric[];
  search_results_domain?: AggMetric[];
  brand_entities_title?: AggMetric[];
  brand_entities_category?: AggMetric[];
  total?: { mentions: number; ai_search_volume: number };
}

type MetricBreakdowns = Omit<AggregatedMetrics, 'total'>;
const METRIC_DIMENSIONS: ReadonlyArray<[keyof MetricBreakdowns, string]> = [
  ['location', 'Local'],
  ['language', 'Idioma'],
  ['platform', 'Plataforma'],
  ['sources_domain', 'Domínio de fonte'],
  ['search_results_domain', 'Domínio nos resultados de busca'],
  ['brand_entities_title', 'Entidade de marca'],
  ['brand_entities_category', 'Categoria de entidade de marca'],
];

interface TargetMetricsResult {
  total_count: number;
  aggregated_metrics: AggregatedMetrics;
}

export interface LeaderboardItem {
  domain?: string;
  brand?: string;
  location?: AggMetric[];
  language?: AggMetric[];
  platform?: AggMetric[];
  sources_domain?: AggMetric[];
  search_results_domain?: AggMetric[];
  brand_entities_title?: AggMetric[];
  brand_entities_category?: AggMetric[];
  total: { mentions: number; ai_search_volume: number };
}

interface LeaderboardResult {
  domains: LeaderboardItem[];
  brands: LeaderboardItem[];
  domainsAggregatedMetrics?: AggregatedMetrics;
  brandsAggregatedMetrics?: AggregatedMetrics;
  domainsTotalCount?: number;
  brandsTotalCount?: number;
}

interface LeaderboardResponse {
  total_count?: number;
  aggregated_metrics?: AggregatedMetrics;
  items?: LeaderboardItem[];
}

interface HistoricalItem {
  year: number;
  month: number;
  metrics: { mentions: number; ai_search_volume: number };
}

interface HistoricalResult {
  items_count: number;
  items: HistoricalItem[];
}

interface SearchParams {
  mode?: string;
  target?: string;
  target_type?: string;
  platform?: string;
  limit?: string;
  location?: string;
  language?: string;
  date_from?: string;
  date_to?: string;
  history_id?: string;
}

// ---- API ----
// `target` must be an array of {domain|keyword, search_filter, search_scope} objects even for a
// single target. DataForSEO supports country/language targeting for Google AI; ChatGPT is fixed to
// United States / English, so we rely on its documented defaults for that platform.

function buildTargetObj(value: string, type: 'domain' | 'keyword') {
  return type === 'domain'
    ? { domain: value, search_filter: 'include', search_scope: ['any'] }
    : { keyword: value, search_filter: 'include', search_scope: ['any'], match_type: 'word_match' };
}

async function callLlmMentions<T>(
  fn: string, body: Record<string, unknown>, login: string, pass: string,
): Promise<{ result?: T; cost?: number; error?: string }> {
  return callDataForSeoFirst<T>(`ai_optimization/llm_mentions/${fn}/live`, body, { login, pass });
}

async function fetchTargetMetrics(
  value: string, type: 'domain' | 'keyword', platform: string, location: string, language: string, login: string, pass: string,
): Promise<{ result?: TargetMetricsResult; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target: [buildTargetObj(value, type)], platform };
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }
  return callLlmMentions<TargetMetricsResult>(
    'target_metrics',
    body,
    login, pass,
  );
}

async function fetchLeaderboard(
  value: string, type: 'domain' | 'keyword', platform: string, location: string, language: string, limit: number, login: string, pass: string,
): Promise<{ result?: LeaderboardResult; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target: [buildTargetObj(value, type)], platform, limit };
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }
  const [domainsRes, brandsRes] = await Promise.all([
    callLlmMentions<LeaderboardResponse>('top_mentioned_domains', body, login, pass),
    callLlmMentions<LeaderboardResponse>('top_mentioned_brands', body, login, pass),
  ]);
  if (domainsRes.error || brandsRes.error) {
    return { error: domainsRes.error ?? brandsRes.error };
  }
  return {
    result: {
      domains: domainsRes.result?.items ?? [],
      brands: brandsRes.result?.items ?? [],
      domainsAggregatedMetrics: domainsRes.result?.aggregated_metrics,
      brandsAggregatedMetrics: brandsRes.result?.aggregated_metrics,
      domainsTotalCount: domainsRes.result?.total_count,
      brandsTotalCount: brandsRes.result?.total_count,
    },
    cost: (domainsRes.cost ?? 0) + (brandsRes.cost ?? 0),
  };
}

async function fetchHistorical(
  value: string, type: 'domain' | 'keyword', platform: string, location: string, language: string,
  dateFrom: string, dateTo: string, login: string, pass: string,
): Promise<{ result?: HistoricalResult; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target: [buildTargetObj(value, type)], platform };
  // ChatGPT mentions are only tracked for United States / English, and the API rejects
  // location_name/language_name outright when platform is chat_gpt (same as the other LLM Mentions
  // endpoints) — so only send geo/language targeting for Google AI.
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;
  return callLlmMentions<HistoricalResult>('historical', body, login, pass);
}

// ---- UI helpers ----

const PLATFORM_LABELS: Record<string, string> = { google: 'Google AI', chat_gpt: 'ChatGPT' };

function fmt(n?: number) { return n != null ? n.toLocaleString('pt-BR') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }

function BreakdownList({ title, items, formatKey = String }: {
  title: string;
  items?: AggMetric[];
  formatKey?: (key: AggMetric['key']) => string;
}) {
  if (!items || items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.mentions), 1);
  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
      <h2 className="nexo-label mb-4">{title}</h2>
      <div className="space-y-2">
        {items.map((item, i) => {
          const pct = Math.round((item.mentions / max) * 100);
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-xs font-medium text-nexo-dim truncate">{formatKey(item.key)}</span>
                <span className="text-[10px] font-mono text-nexo-dim shrink-0 tabular-nums">
                  {fmt(item.mentions)} menções · volume {fmt(item.ai_search_volume)}
                </span>
              </div>
              <div className="h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                <div className="h-full bg-nexo-sky/40 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function MonthlyTrendChart({ title, items, metric }: { title: string; items: HistoricalItem[]; metric: 'mentions' | 'ai_search_volume' }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const values = sorted.map((i) => i.metrics[metric]);
  const max = Math.max(...values, 1);
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const trendLabel = delta > 0 ? 'em alta' : delta < 0 ? 'em queda' : 'estável';
  const trendColor = delta > 0
    ? 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30'
    : delta < 0
      ? 'text-nexo-danger-text bg-nexo-danger/10 border-nexo-danger/40'
      : 'text-nexo-dim bg-white/[0.02] border-nexo-border';

  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
      <div className="flex items-center justify-between mb-6">
        <h2 className="nexo-label">{title}</h2>
        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md border ${trendColor}`}>
          {trendLabel}{sorted.length > 1 ? ` (${delta > 0 ? '+' : ''}${fmt(delta)})` : ''}
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-36">
        {sorted.map((item, i) => {
          const val = item.metrics[metric];
          const h = Math.max(3, Math.round((val / max) * 128));
          return (
            <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1.5 group relative h-full">
              <span className="absolute -top-4 text-[10px] font-mono text-nexo-dim opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {fmt(val)}
              </span>
              <div className="w-full bg-nexo-sky/40 group-hover:bg-nexo-sky rounded-t-md transition-colors" style={{ height: `${h}px` }} />
              <span className="text-[9px] text-nexo-faint whitespace-nowrap shrink-0">{monthLabel(item.year, item.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Page ----

async function AiVisibilityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const mode: AiVisibilityMode =
    params.mode === 'leaderboard' ? 'leaderboard' : params.mode === 'historical' ? 'historical' : 'target';
  const targetValue = (params.target ?? '').trim();
  const targetType = (params.target_type === 'domain' ? 'domain' : 'keyword') as 'keyword' | 'domain';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'chat_gpt';
  const limit = Math.min(Math.max(parseInt(params.limit ?? '10', 10) || 10, 1), 50);
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'Brazil');
  const defaultLanguage = getSetting('default_language') ?? 'Portuguese';
  const brand = getBrandSettings();
  const brandName = brand.name;
  const brandLogoUrl = brand.logo ?? undefined;
  const location = platform === 'chat_gpt' ? 'United States' : (params.location ?? defaultLocation);
  const language = platform === 'chat_gpt' ? 'English' : (params.language ?? defaultLanguage);
  const dateFrom = params.date_from ?? '';
  const dateTo = params.date_to ?? '';

  let targetResult: TargetMetricsResult | null = null;
  let leaderboardResult: LeaderboardResult | null = null;
  let historicalResult: HistoricalResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: AiVisibilityEntry | null = null;

  if (historyId) {
    if (mode === 'target') targetResult = getAiVisibilityResult<TargetMetricsResult>(historyId);
    else if (mode === 'leaderboard') leaderboardResult = getAiVisibilityResult<LeaderboardResult>(historyId);
    else historicalResult = getAiVisibilityResult<HistoricalResult>(historyId);
    if (targetResult || leaderboardResult || historicalResult) {
      isFromHistory = true;
      activeEntry = getAiVisibilityHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Esta busca não está mais disponível.';
    }
  } else if (targetValue) {
    if (!creds) {
      error = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const dedupeId = mode === 'historical'
        ? stableSearchId(['ai-visibility', mode, targetValue, targetType, platform, location, language, dateFrom, dateTo])
        : stableSearchId(['ai-visibility', mode, targetValue, targetType, platform, location, language, limit]);
      const cached = getAiVisibilityResult<TargetMetricsResult | LeaderboardResult | HistoricalResult>(dedupeId);

      if (cached) {
        if (mode === 'target') targetResult = cached as TargetMetricsResult;
        else if (mode === 'leaderboard') leaderboardResult = cached as LeaderboardResult;
        else historicalResult = cached as HistoricalResult;
        cost = getAiVisibilityHistory().find((e) => e.id === dedupeId)?.cost;
      } else {
        const res = mode === 'target'
          ? await fetchTargetMetrics(targetValue, targetType, platform, location, language, creds.login, creds.pass)
          : mode === 'leaderboard'
            ? await fetchLeaderboard(targetValue, targetType, platform, location, language, limit, creds.login, creds.pass)
            : await fetchHistorical(targetValue, targetType, platform, location, language, dateFrom, dateTo, creds.login, creds.pass);

        error = res.error ?? null;
        cost = res.cost;

        if (!error && res.result) {
          if (mode === 'target') targetResult = res.result as TargetMetricsResult;
          else if (mode === 'leaderboard') leaderboardResult = res.result as LeaderboardResult;
          else historicalResult = res.result as HistoricalResult;

          const entry: AiVisibilityEntry = { id: dedupeId, ts: Date.now(), mode, target: targetValue, platform, cost };
          saveAiVisibilitySearch(entry, res.result);
        }
      }
    }
  }

  const history = getAiVisibilityHistory();
  const hasQuery = !!(historyId || targetValue);
  const displayTarget = activeEntry?.target ?? targetValue;
  const agg = targetResult?.aggregated_metrics;
  const formatBreakdownKey = (dimension: string, key: AggMetric['key']) =>
    dimension === 'Local' ? labsLocationLabel(key) : String(key);
  const reportDate = activeEntry?.ts ?? Date.now();
  const reportSlug = displayTarget.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'report';
  let reportMetrics: ReportMetric[] = [];
  let reportSections: ReportSection[] = [];
  let reportSheets: ExportSheet[] = [];
  let reportCsvData: Record<string, unknown>[] = [];
  let reportCsvColumns: Array<{ key: string; label: string }> = [];

  if (mode === 'target' && targetResult) {
    const breakdowns: Array<[string, AggMetric[] | undefined]> = [
      ['Plataforma', agg?.platform], ['Local', agg?.location], ['Idioma', agg?.language], ['Domínio de fonte', agg?.sources_domain],
      ['Domínio nos resultados de busca', agg?.search_results_domain], ['Entidade de marca', agg?.brand_entities_title], ['Categoria de entidade de marca', agg?.brand_entities_category],
    ];
    reportMetrics = [
      { label: 'Plataforma', value: PLATFORM_LABELS[platform] ?? platform },
      { label: 'Menções', value: fmt(agg?.total?.mentions) },
      { label: 'Volume de buscas em IA', value: fmt(agg?.total?.ai_search_volume) },
    ];
    reportSections = breakdowns.map(([title, items]) => ({
      title: `Menções por ${title.toLowerCase()}`,
      rows: (items ?? []).slice(0, 12).map((item) => [formatBreakdownKey(title, item.key), `${fmt(item.mentions)} menções`]),
    }));
    reportSheets = [
      { name: 'Visão geral', columns: [{ key: 'metric', label: 'Métrica' }, { key: 'value', label: 'Valor' }], data: reportMetrics.map((metric) => ({ metric: metric.label, value: metric.value })) },
      ...breakdowns.map(([name, items]) => ({
        name: name.slice(0, 31),
        columns: [{ key: 'name', label: name }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }],
        data: (items ?? []).map((item) => ({ name: formatBreakdownKey(name, item.key), mentions: item.mentions, volume: item.ai_search_volume })),
      })),
    ];
    reportCsvColumns = [{ key: 'dimension', label: 'Dimensão' }, { key: 'name', label: 'Nome' }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }];
    reportCsvData = breakdowns.flatMap(([dimension, items]) => (items ?? []).map((item) => ({ dimension, name: formatBreakdownKey(dimension, item.key), mentions: item.mentions, volume: item.ai_search_volume })));
  } else if (mode === 'leaderboard' && leaderboardResult) {
    const toRows = (items: LeaderboardItem[], field: 'domain' | 'brand') => items.map((item) => ({
      name: item[field] ?? '', mentions: item.total?.mentions ?? 0, volume: item.total?.ai_search_volume ?? 0,
    }));
    const domains = toRows(leaderboardResult.domains, 'domain');
    const brands = toRows(leaderboardResult.brands, 'brand');
    const detailedRows = (scope: string, name: string, metrics?: MetricBreakdowns) =>
      METRIC_DIMENSIONS.flatMap(([dimension, label]) => (metrics?.[dimension] ?? []).map((item) => ({
        scope, name, dimension: label, key: formatBreakdownKey(label, item.key), mentions: item.mentions, volume: item.ai_search_volume,
      })));
    const metricDetails = [
      ...detailedRows('Ranking de domínios', 'Todos os domínios', leaderboardResult.domainsAggregatedMetrics),
      ...detailedRows('Ranking de marcas', 'Todas as marcas', leaderboardResult.brandsAggregatedMetrics),
      ...leaderboardResult.domains.flatMap((item) => detailedRows('Domínio', item.domain ?? '—', item)),
      ...leaderboardResult.brands.flatMap((item) => detailedRows('Marca', item.brand ?? '—', item)),
    ];
    reportMetrics = [
      { label: 'Plataforma', value: PLATFORM_LABELS[platform] ?? platform },
      { label: 'Domínios no ranking', value: String(domains.length) },
      { label: 'Marcas no ranking', value: String(brands.length) },
    ];
    reportSections = [
      { title: 'Domínios mais mencionados', rows: domains.slice(0, 12).map((row) => [String(row.name), `${fmt(Number(row.mentions))} menções`]) },
      { title: 'Marcas mais mencionadas', rows: brands.slice(0, 12).map((row) => [String(row.name), `${fmt(Number(row.mentions))} menções`]) },
    ];
    reportSheets = [
      { name: 'Domínios', columns: [{ key: 'name', label: 'Domínio' }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }], data: domains },
      { name: 'Marcas', columns: [{ key: 'name', label: 'Marca' }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }], data: brands },
      { name: 'Detalhes das métricas', columns: [{ key: 'scope', label: 'Escopo' }, { key: 'name', label: 'Nome' }, { key: 'dimension', label: 'Dimensão' }, { key: 'key', label: 'Valor' }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }], data: metricDetails },
    ];
    reportCsvColumns = [{ key: 'scope', label: 'Escopo' }, { key: 'name', label: 'Nome' }, { key: 'dimension', label: 'Dimensão' }, { key: 'key', label: 'Valor' }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }];
    reportCsvData = [
      ...domains.map((row) => ({ scope: 'Domínio', name: row.name, dimension: 'Total', key: '', mentions: row.mentions, volume: row.volume })),
      ...brands.map((row) => ({ scope: 'Marca', name: row.name, dimension: 'Total', key: '', mentions: row.mentions, volume: row.volume })),
      ...metricDetails,
    ];
  } else if (mode === 'historical' && historicalResult) {
    const months = [...historicalResult.items].sort((a, b) => (a.year - b.year) || (a.month - b.month)).map((item) => ({
      month: `${item.year}-${String(item.month).padStart(2, '0')}`, mentions: item.metrics.mentions, volume: item.metrics.ai_search_volume,
    }));
    reportMetrics = [
      { label: 'Plataforma', value: PLATFORM_LABELS[platform] ?? platform },
      { label: 'Meses monitorados', value: String(months.length) },
      { label: 'Menções mais recentes', value: fmt(months.at(-1)?.mentions) },
      { label: 'Volume em IA mais recente', value: fmt(months.at(-1)?.volume) },
    ];
    reportSections = [{ title: 'Histórico mensal', rows: months.slice(-18).reverse().map((row) => [row.month, `${fmt(row.mentions)} menções · volume ${fmt(row.volume)}`]) }];
    reportSheets = [{ name: 'Histórico mensal', columns: [{ key: 'month', label: 'Mês' }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }], data: months }];
    reportCsvColumns = [{ key: 'month', label: 'Mês' }, { key: 'mentions', label: 'Menções' }, { key: 'volume', label: 'Volume de buscas em IA' }];
    reportCsvData = months;
  }
  const canExportReport = reportMetrics.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Visibilidade em IA</h1>
        <p className="text-sm text-nexo-faint mt-1">Com que frequência um domínio ou marca é mencionado por LLMs e quem domina um tema — via DataForSEO LLM Mentions.</p>
      </div>

      <SearchForm
        className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
        btnLabel={mode === 'target' ? 'Analisar' : mode === 'leaderboard' ? 'Ver ranking' : 'Mostrar tendência'}
        btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-sky transition-colors"
      >
        <div className="nexo-seg mb-2 max-w-full flex-wrap">
          {(['target', 'leaderboard', 'historical'] as const).map((m) => (
            <a
              key={m}
              href={`/dashboard/ai-visibility?mode=${m}`}
              aria-current={mode === m ? 'page' : undefined}
              className={`transition-colors hover:text-white ${mode === m ? 'active' : ''}`}
            >
              {m === 'target' ? 'Meu domínio/marca' : m === 'leaderboard' ? 'Ranking do tema' : 'Tendência no tempo'}
            </a>
          ))}
        </div>
        <input type="hidden" name="mode" value={mode} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 flex gap-2">
            <div className="shrink-0">
              <label className="nexo-label block mb-1.5">Tipo</label>
              <select name="target_type" defaultValue={targetType}
                className="nexo-input min-w-0 w-full h-[42px] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
                <option value="domain">Domínio</option>
                <option value="keyword">Palavra-chave</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="nexo-label block mb-1.5">
                {mode === 'leaderboard' ? 'Tema' : 'Alvo'}
              </label>
              <input
                name="target"
                type="text"
                defaultValue={displayTarget}
                placeholder={targetType === 'domain' ? 'exemplo.com.br' : mode === 'leaderboard' ? 'melhor encanador' : 'nome da sua marca'}
                required
                className="nexo-input min-w-0 w-full h-[42px] px-4 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              />
            </div>
          </div>

          {mode === 'historical' ? (
            <HistoricalTargetingFields
              defaultPlatform={platform}
              defaultLocation={location}
              defaultLanguage={language}
              defaultDateFrom={dateFrom}
              defaultDateTo={dateTo}
            />
          ) : (
            <>
              <MentionTargetingFields defaultPlatform={platform} defaultLocation={location} defaultLanguage={language} />

              {mode === 'leaderboard' && (
                <div>
                  <label className="nexo-label block mb-1.5">Resultados por lista</label>
                  <select name="limit" defaultValue={String(limit)}
                    className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
                    {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {canExportReport && (
        <div className="flex items-center justify-between gap-4 border-y border-nexo-border py-3">
          <p className="nexo-label">Exportar relatório atual</p>
          <div className="flex items-center gap-3">
            <ReportPdfExportButton brandName={brandName} brandLogoUrl={brandLogoUrl} brandColor={brand.color} brandFooter={brand.footer} brandStyle={brand} filename={`ai-visibility-${reportSlug}.pdf`}
              title="Relatório de visibilidade em IA" subject={displayTarget} generatedAt={reportDate} metrics={reportMetrics} sections={reportSections} />
            <ExportExcelButton sheets={reportSheets} filename={`ai-visibility-${reportSlug}.xls`} />
            <ExportCSVButton data={reportCsvData} columns={reportCsvColumns} filename={`ai-visibility-${reportSlug}.csv`} />
          </div>
        </div>
      )}

      {hasQuery && !error && mode === 'target' && targetResult && (
        <div id="results" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="nexo-label">Alvo</span>
            <span className="font-mono font-medium text-nexo-text">{displayTarget}</span>
            {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint ml-auto">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
              <p className="nexo-label">Total de menções</p>
              <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{fmt(agg?.total?.mentions)}</p>
            </div>
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
              <p className="nexo-label">Volume de buscas em IA</p>
              <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{fmt(agg?.total?.ai_search_volume)}</p>
            </div>
          </div>

          {(!agg?.total || agg.total.mentions === 0) ? (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center text-sm text-nexo-faint">
              Nenhuma menção em LLMs encontrada para este alvo em {PLATFORM_LABELS[platform]}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BreakdownList title="Por plataforma" items={agg?.platform} />
              <BreakdownList title="Por local" items={agg?.location} formatKey={labsLocationLabel} />
              <BreakdownList title="Por idioma" items={agg?.language} />
              <BreakdownList title="Principais domínios de fonte" items={agg?.sources_domain} />
              <BreakdownList title="Principais domínios nos resultados de busca" items={agg?.search_results_domain} />
              <BreakdownList title="Entidades de marca mencionadas junto" items={agg?.brand_entities_title} />
              <BreakdownList title="Categorias de entidades de marca" items={agg?.brand_entities_category} />
            </div>
          )}
        </div>
      )}

      {hasQuery && !error && mode === 'leaderboard' && leaderboardResult && (
        <div id="results">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <span className="nexo-label">Tema</span>
            <span className="font-mono font-medium text-nexo-text">{displayTarget}</span>
            {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint ml-auto">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
          </div>
          <LeaderboardTables
            domains={leaderboardResult.domains}
            brands={leaderboardResult.brands}
            domainAggregates={leaderboardResult.domainsAggregatedMetrics}
            brandAggregates={leaderboardResult.brandsAggregatedMetrics}
            domainsTotalCount={leaderboardResult.domainsTotalCount}
            brandsTotalCount={leaderboardResult.brandsTotalCount}
            topic={displayTarget}
          />
        </div>
      )}

      {hasQuery && !error && mode === 'historical' && historicalResult && (
        <div id="results" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="nexo-label">Alvo</span>
            <span className="font-mono font-medium text-nexo-text">{displayTarget}</span>
            {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint ml-auto">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
          </div>

          {historicalResult.items.length === 0 ? (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center text-sm text-nexo-faint">
              Nenhuma menção histórica em LLMs encontrada para este alvo em {PLATFORM_LABELS[platform]}.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                  <p className="nexo-label">Meses monitorados</p>
                  <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{historicalResult.items.length}</p>
                </div>
                <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                  <p className="nexo-label">Total de menções</p>
                  <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">
                    {fmt(historicalResult.items.reduce((s, i) => s + i.metrics.mentions, 0))}
                  </p>
                </div>
                <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
                  <p className="nexo-label">Volume total de buscas em IA</p>
                  <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">
                    {fmt(historicalResult.items.reduce((s, i) => s + i.metrics.ai_search_volume, 0))}
                  </p>
                </div>
              </div>

              <MonthlyTrendChart title="Menções por mês" items={historicalResult.items} metric="mentions" />
              <MonthlyTrendChart title="Volume de buscas em IA por mês" items={historicalResult.items} metric="ai_search_volume" />
            </>
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
                <a key={entry.id} href={`/dashboard/ai-visibility?history_id=${entry.id}&mode=${entry.mode}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                      <span className="text-[10px] font-medium text-nexo-faint bg-nexo-surface-2 px-1.5 py-0.5 rounded shrink-0">
                        {entry.mode === 'target' ? 'Visão geral' : entry.mode === 'leaderboard' ? 'Ranking' : 'Tendência'}
                      </span>
                    </div>
                    <p className="text-[11px] text-nexo-faint mt-0.5">
                      {PLATFORM_LABELS[entry.platform] ?? entry.platform}
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

export default withProjectScope(AiVisibilityPage);
