// Advisory cost estimate for one keyword suggestion research. Prices follow DataForSEO's public
// price list at the time of writing; the real charge is whatever DataForSEO reports per task and
// is what the Spending page records. This is not a provider-enforced limit.
import { formatBrl, type BudgetStatus } from '@/modules/custos/budget-shared';
import { MAX_DEMAND_PHRASES, MAX_THEMES } from './themes';
import type { Estimate, EstimateLine } from './types';

export const ENDPOINTS = {
  gbp: 'business_data/google/my_business_info/live',
  site: 'on_page/instant_pages',
  demand: 'dataforseo_labs/google/keyword_overview/live',
  maps: 'serp/google/maps/live/advanced',
} as const;

export const PRICES_USD = {
  gbp: 0.0054,
  /** Only used when the free direct fetch of the homepage fails. */
  instantPage: 0.000125,
  demandTask: 0.01,
  demandKeyword: 0.0001,
  mapsTask: 0.002,
} as const;

const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

export function estimateResearch(options: { hasBusiness: boolean; hasWebsite: boolean; mapsProbe: boolean }): Estimate {
  const lines: EstimateLine[] = [];
  if (options.hasBusiness) {
    lines.push({
      key: 'gbp', label: 'Perfil da empresa no Google', endpoint: ENDPOINTS.gbp, quantity: 1, unitUsd: PRICES_USD.gbp, usd: PRICES_USD.gbp,
      optional: false, note: 'Categorias, título, descrição e site do perfil público.',
    });
  }
  lines.push({
    key: 'site', label: 'Página inicial do site', endpoint: ENDPOINTS.site, quantity: 1, unitUsd: PRICES_USD.instantPage, usd: PRICES_USD.instantPage,
    optional: true,
    note: options.hasWebsite
      ? 'Lemos o HTML direto, sem custo. Só se a leitura falhar usamos o on_page/instant_pages (valor máximo).'
      : 'Usa o site do perfil do Google. Lemos o HTML direto, sem custo; on_page/instant_pages só se falhar.',
  });
  const demandUsd = PRICES_USD.demandTask + PRICES_USD.demandKeyword * MAX_DEMAND_PHRASES;
  lines.push({
    key: 'demanda', label: 'Volume de buscas dos termos candidatos', endpoint: ENDPOINTS.demand, quantity: 1, unitUsd: demandUsd, usd: demandUsd,
    optional: false, note: `1 tarefa com até ${MAX_DEMAND_PHRASES} termos (US$ 0,01 + US$ 0,0001 por termo). Volume nacional, não demanda local.`,
  });
  if (options.mapsProbe) {
    lines.push({
      key: 'maps', label: 'Sondagem no Google Maps (opcional)', endpoint: ENDPOINTS.maps, quantity: MAX_THEMES, unitUsd: PRICES_USD.mapsTask,
      usd: PRICES_USD.mapsTask * MAX_THEMES, optional: true,
      note: `Até ${MAX_THEMES} buscas, uma por consulta escolhida, no centro do local. Mostra se o Maps devolve empresas do ramo.`,
    });
  }
  return { lines: lines.map((l) => ({ ...l, usd: round(l.usd) })), totalUsd: round(lines.reduce((sum, l) => sum + l.usd, 0)) };
}

/** Null when the estimate fits the monthly caps; otherwise the reason to block the run. */
export function budgetBlockReason(status: BudgetStatus, estimateUsd: number): string | null {
  if (status.blocked) return status.reason ?? 'O teto mensal de gastos foi atingido.';
  const estimateBrl = estimateUsd * status.brlPerUsd;
  if (status.clientCapBrl !== null && status.clientSpentBrl + estimateBrl > status.clientCapBrl) {
    return `Esta pesquisa (cerca de ${formatBrl(estimateBrl)}) passaria do teto mensal deste cliente (${formatBrl(status.clientCapBrl)}; já gastos ${formatBrl(status.clientSpentBrl)}).`;
  }
  if (status.globalCapBrl !== null && status.globalSpentBrl + estimateBrl > status.globalCapBrl) {
    return `Esta pesquisa (cerca de ${formatBrl(estimateBrl)}) passaria do teto mensal de todos os clientes (${formatBrl(status.globalCapBrl)}; já gastos ${formatBrl(status.globalSpentBrl)}).`;
  }
  return null;
}

export function formatUsdPrecise(n: number): string {
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: n < 0.01 && n > 0 ? 4 : 2, maximumFractionDigits: 4 })}`;
}
