// Research flow, independent of Next.js and the database so it can run against fakes in tests:
// GBP profile -> homepage -> candidates/themes -> demand -> selection -> optional Maps probe.
import type { DfsTaskResult } from '@/lib/dataforseo';
import { toLabsCountry } from '@/lib/geo-options';
import { buildCandidates } from './candidates';
import { ENDPOINTS } from './estimate';
import { fold, matchForm } from './normalize';
import { demandPhrases, groupThemes, selectThemes } from './themes';
import { captureFromInstantPage, fetchHomepage, hasContent, normalizeWebsite, parseHomepage, type HtmlFetcher, type InstantPageItem } from './website';
import type { Demand, GbpProfile, MapsProbe, ResearchInput, ResearchResult, SourceLog, WebsiteCapture } from './types';

export type DfsCaller = <T>(endpoint: string, body: Record<string, unknown>) => Promise<DfsTaskResult<T>>;

export interface ResearchDeps {
  call: DfsCaller;
  fetchHtml?: HtmlFetcher;
  now?: () => Date;
}

interface GbpItem {
  type?: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  additional_categories?: string[] | null;
  url?: string | null;
  domain?: string | null;
  address?: string | null;
  cid?: string | null;
}

interface OverviewItem {
  keyword?: string;
  keyword_info?: { search_volume?: number | null; competition_level?: string | null };
  search_intent_info?: { main_intent?: string | null };
}

interface MapsItem {
  type?: string;
  title?: string;
  cid?: string;
  domain?: string;
  category?: string;
}

export function parseGbp(result: Array<{ items?: GbpItem[] | null }> | undefined): GbpProfile | null {
  const item = result?.[0]?.items?.find((i) => !i.type || i.type === 'google_business_info') ?? result?.[0]?.items?.[0];
  if (!item?.title) return null;
  return {
    title: item.title,
    category: item.category ?? null,
    additionalCategories: (item.additional_categories ?? []).filter((c): c is string => typeof c === 'string' && c.trim() !== ''),
    description: item.description ?? null,
    url: item.url ?? null,
    domain: item.domain ?? null,
    address: item.address ?? null,
    cid: item.cid ?? null,
  };
}

export function parseDemand(result: Array<{ items?: OverviewItem[] | null }> | undefined): Map<string, Demand> {
  const map = new Map<string, Demand>();
  for (const item of result?.[0]?.items ?? []) {
    if (!item.keyword) continue;
    map.set(matchForm(item.keyword), {
      volume: typeof item.keyword_info?.search_volume === 'number' ? item.keyword_info.search_volume : null,
      intent: item.search_intent_info?.main_intent ?? null,
      competition: item.keyword_info?.competition_level ?? null,
    });
  }
  return map;
}

export function parseProbe(query: string, result: Array<{ items?: MapsItem[] | null }> | undefined, target: { cid: string | null; domain: string | null; title: string }): MapsProbe {
  const items = (result?.[0]?.items ?? []).filter((i) => !i.type || i.type === 'maps_search');
  const domain = target.domain?.replace(/^www\./, '').toLowerCase() ?? null;
  const index = items.findIndex((i) =>
    (target.cid && i.cid === target.cid)
    || (domain && i.domain?.replace(/^www\./, '').toLowerCase() === domain)
    || (target.title && i.title && fold(i.title) === fold(target.title)));
  const counts = new Map<string, number>();
  for (const item of items) if (item.category) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const topCategories = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} (${n})`);
  return { query, status: 'ok', resultCount: items.length, targetPosition: index >= 0 ? index + 1 : null, topCategories };
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

export async function runResearch(input: ResearchInput, deps: ResearchDeps): Promise<ResearchResult> {
  const now = deps.now ?? (() => new Date());
  const fetchHtml = deps.fetchHtml ?? fetchHomepage;
  const sources: SourceLog[] = [];
  const limitations: string[] = [];
  let total = 0;
  const log = (entry: Omit<SourceLog, 'observedAt'>) => {
    sources.push({ ...entry, observedAt: now().toISOString() });
    if (entry.costUsd) total += entry.costUsd;
  };
  const labsLocation = toLabsCountry(input.location);

  // 1. Public Google Business Profile.
  let gbp: GbpProfile | null = null;
  const keyword = input.cid ? `cid:${input.cid}` : input.business.trim();
  if (keyword) {
    const res = await deps.call<{ items?: GbpItem[] }>(ENDPOINTS.gbp, { keyword, location_name: input.location, language_name: input.language });
    gbp = res.error ? null : parseGbp(res.result);
    log({ step: 'gbp', endpoint: ENDPOINTS.gbp, status: res.error ? 'erro' : 'ok', message: res.error ?? (gbp ? undefined : 'Nenhum perfil encontrado.'), costUsd: res.cost ?? null });
    if (!gbp) limitations.push('Perfil do Google não encontrado: as categorias não puderam ser usadas como evidência.');
  } else {
    log({ step: 'gbp', endpoint: ENDPOINTS.gbp, status: 'pulado', message: 'Nenhuma empresa informada.', costUsd: null });
  }

  // 2. Homepage: free direct fetch, paid instant_pages only if that fails.
  const websiteUrl = normalizeWebsite(input.website) ?? normalizeWebsite(gbp?.url ?? '') ?? (gbp?.domain ? normalizeWebsite(gbp.domain) : null);
  let website: WebsiteCapture | null = null;
  if (websiteUrl) {
    const direct = await fetchHtml(websiteUrl);
    const parsed = direct.html ? parseHomepage(direct.html, direct.finalUrl ?? websiteUrl) : null;
    if (parsed && hasContent(parsed)) {
      website = parsed;
      log({ step: 'site', endpoint: 'leitura direta do HTML', status: 'ok', costUsd: 0 });
    } else {
      const reason = direct.error ?? 'A página não tem título nem cabeçalhos legíveis sem JavaScript.';
      log({ step: 'site', endpoint: 'leitura direta do HTML', status: 'erro', message: reason, costUsd: 0 });
      const res = await deps.call<{ items?: InstantPageItem[] }>(ENDPOINTS.site, { url: websiteUrl, load_resources: false, enable_javascript: false });
      const item = res.result?.[0]?.items?.[0];
      const fallback = item ? captureFromInstantPage(item, websiteUrl) : null;
      if (!res.error && fallback && hasContent(fallback)) website = fallback;
      log({ step: 'site', endpoint: ENDPOINTS.site, status: res.error || !website ? 'erro' : 'ok', message: res.error ?? (website ? undefined : 'Sem conteúdo legível.'), costUsd: res.cost ?? null });
      if (!website) limitations.push(`Não foi possível ler o site (${reason}). Isso não prova que a empresa não oferece os serviços.`);
    }
  } else {
    log({ step: 'site', endpoint: 'leitura direta do HTML', status: 'pulado', message: 'Sem site informado nem no perfil.', costUsd: null });
    limitations.push('Sem site: as ofertas não foram verificadas em páginas da empresa.');
  }

  // 3. Candidates and themes from evidence.
  const { candidates, rejected } = buildCandidates({ gbp, site: website, businessName: input.business, location: input.location });
  const themes = groupThemes(candidates);

  // 4. Demand for the candidate phrases.
  let demand = new Map<string, Demand>();
  const phrases = demandPhrases(themes);
  if (phrases.length > 0) {
    const res = await deps.call<{ items?: OverviewItem[] }>(ENDPOINTS.demand, { keywords: phrases, location_name: labsLocation, language_name: input.language });
    if (!res.error) demand = parseDemand(res.result);
    log({ step: 'demanda', endpoint: ENDPOINTS.demand, status: res.error ? 'erro' : 'ok', message: res.error, costUsd: res.cost ?? null });
    if (res.error) limitations.push('O volume de buscas não pôde ser medido; a escolha usou só a evidência de oferta.');
    else limitations.push(`Volume de buscas mensal em ${labsLocation} (nacional): é contexto, não estimativa de clientes na cidade.`);
  } else {
    log({ step: 'demanda', endpoint: ENDPOINTS.demand, status: 'pulado', message: 'Nenhum termo candidato.', costUsd: null });
  }

  // 5. Selection.
  const selection = selectThemes(themes, demand, { hasGbp: !!gbp?.category, hasWebsite: !!website });

  // 6. Optional Maps probe of the chosen queries (one origin: the location's center).
  if (input.mapsProbe && selection.selected.length > 0) {
    const target = { cid: gbp?.cid ?? input.cid, domain: hostOf(websiteUrl), title: gbp?.title ?? input.business };
    for (const theme of selection.selected) {
      const res = await deps.call<{ items?: MapsItem[] }>(ENDPOINTS.maps, { keyword: theme.query, location_name: input.location, language_name: input.language, depth: 20 });
      theme.probe = res.error
        ? { query: theme.query, status: 'erro', error: res.error, resultCount: 0, targetPosition: null, topCategories: [] }
        : parseProbe(theme.query, res.result, target);
      if (theme.probe.status === 'ok') {
        theme.evidence.push({
          kind: 'maps',
          quote: theme.probe.resultCount === 0
            ? 'Maps sem resultados'
            : `Maps: ${theme.probe.resultCount} empresas${theme.probe.targetPosition ? `, empresa na posição ${theme.probe.targetPosition}` : ', empresa fora da lista'}`,
          source: ENDPOINTS.maps,
        });
      }
      log({ step: 'maps', endpoint: ENDPOINTS.maps, status: res.error ? 'erro' : 'ok', message: res.error, costUsd: res.cost ?? null });
    }
    limitations.push('A sondagem no Maps usa uma única origem (o centro do local); não substitui a grade nem as três origens do estudo completo.');
  }

  return {
    input,
    labsLocation,
    gbp,
    website,
    candidates,
    rejected,
    selection,
    sources,
    totalCostUsd: Math.round(total * 1_000_000) / 1_000_000,
    limitations,
    observedAt: now().toISOString(),
  };
}
