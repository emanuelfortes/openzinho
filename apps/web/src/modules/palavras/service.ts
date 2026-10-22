// Server-side steps behind the page's actions: validate, estimate, gate on the explicit
// confirmation and the monthly caps, run, save. Dependencies are injectable for tests.
import { callDataForSeo } from '@/lib/dataforseo';
import { getCredentials, getCurrentProject } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import { getBudgetStatus, type BudgetStatus } from '@/modules/custos/budget';
import { budgetBlockReason, estimateResearch } from './estimate';
import { findRecentPesquisa, savePesquisa, type PesquisaResumo } from './palavras-db';
import { runResearch, type DfsCaller, type ResearchDeps } from './research';
import { parseBusinessInput } from './shared';
import { normalizeWebsite } from './website';
import type { Estimate, ResearchInput } from './types';

export interface RawResearchForm {
  business?: string;
  cid?: string;
  website?: string;
  location?: string;
  language?: string;
  mapsProbe?: boolean;
}

export const DEFAULT_LOCATION = 'Sao Paulo,State of Sao Paulo,Brazil';

export function validateInput(raw: RawResearchForm): { input: ResearchInput } | { error: string } {
  const parsed = parseBusinessInput(raw.business ?? '');
  const cid = (raw.cid ?? '').trim() || parsed.cid;
  if (cid && !/^\d{5,25}$/.test(cid)) return { error: 'CID inválido.' };
  const websiteText = (raw.website ?? '').trim();
  const website = websiteText ? normalizeWebsite(websiteText) : '';
  if (website === null) return { error: 'Informe um site público válido (ex.: https://exemplo.com.br).' };
  const business = parsed.name.trim().slice(0, 200);
  if (!business && !cid && !website) return { error: 'Informe a empresa (nome ou link do Google Maps) ou o site.' };
  const location = (raw.location ?? '').trim() || DEFAULT_LOCATION;
  const language = LANGUAGES.find((l) => l.value === raw.language)?.value ?? 'Portuguese';
  return { input: { business, cid: cid || null, website: website ?? '', location, language, mapsProbe: raw.mapsProbe === true } };
}

export function estimateFor(input: ResearchInput): Estimate {
  return estimateResearch({ hasBusiness: !!(input.business || input.cid), hasWebsite: !!input.website, mapsProbe: input.mapsProbe });
}

export interface EstimateResponse {
  estimate: Estimate;
  brlPerUsd: number;
  blockReason: string | null;
  existing: PesquisaResumo | null;
  hasCredentials: boolean;
}

export function prepareEstimate(raw: RawResearchForm, budget: BudgetStatus = getBudgetStatus(getCurrentProject().id)): EstimateResponse | { error: string } {
  const valid = validateInput(raw);
  if ('error' in valid) return valid;
  const estimate = estimateFor(valid.input);
  return {
    estimate,
    brlPerUsd: budget.brlPerUsd,
    blockReason: budgetBlockReason(budget, estimate.totalUsd),
    existing: findRecentPesquisa(valid.input),
    hasCredentials: !!getCredentials(),
  };
}

export function realDeps(): ResearchDeps | null {
  const creds = getCredentials();
  if (!creds) return null;
  const call: DfsCaller = (endpoint, body) => callDataForSeo(endpoint, body, creds, 60_000);
  return { call };
}

/**
 * Runs only when the caller confirmed at least the current estimate (the equivalent of the CLI's
 * `--execute --confirm-cost-usd`) and the monthly caps allow it. Saves even partial results so
 * the reported cost is recorded.
 */
export async function executeResearch(
  raw: RawResearchForm,
  confirmedUsd: number,
  options: { deps?: ResearchDeps | null; budget?: BudgetStatus } = {},
): Promise<{ id: string } | { error: string }> {
  const valid = validateInput(raw);
  if ('error' in valid) return valid;
  const estimate = estimateFor(valid.input);
  if (!Number.isFinite(confirmedUsd) || confirmedUsd + 1e-9 < estimate.totalUsd) {
    return { error: 'Confirme a estimativa atual antes de pesquisar.' };
  }
  const block = budgetBlockReason(options.budget ?? getBudgetStatus(getCurrentProject().id), estimate.totalUsd);
  if (block) return { error: block };
  const deps = options.deps === undefined ? realDeps() : options.deps;
  if (!deps) return { error: 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.' };
  const result = await runResearch(valid.input, deps);
  return { id: savePesquisa(result) };
}
