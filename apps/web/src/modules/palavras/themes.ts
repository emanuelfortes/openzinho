// Groups candidates into distinct themes and picks the smallest useful portfolio: 3-5 themes,
// one representative query each, never padded with synonyms (docs/QUERY_SELECTION_POLICY.md).
// The ordering is qualitative (evidence tier first, demand only breaks ties inside a tier); it is
// not an opportunity score.
import { matchForm } from './normalize';
import type { Candidate, Demand, DroppedTheme, Evidence, SelectedTheme, Selection, Strength, Theme } from './types';

export const MIN_THEMES = 3;
export const MAX_THEMES = 5;
/** Phrases sent to the demand endpoint (one Labs task, priced per keyword). */
export const MAX_DEMAND_PHRASES = 30;

const GBP_KINDS = new Set(['gbp_categoria_principal', 'gbp_categoria_adicional']);
const SITE_KINDS = new Set(['site_titulo', 'site_meta', 'site_h1', 'site_h2', 'site_link']);

function slug(text: string): string {
  return matchForm(text).replace(/\s+/g, '-') || 'tema';
}

function evidenceRank(candidate: Candidate): number {
  return candidate.evidence.reduce((sum, e) => sum + (e.kind === 'gbp_categoria_principal' ? 4 : GBP_KINDS.has(e.kind) ? 3 : SITE_KINDS.has(e.kind) ? 1 : 0.5), 0);
}

/** Merges candidates with the same theme key; strongest-evidence phrase first. */
export function groupThemes(candidates: Candidate[]): Theme[] {
  const byKey = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const list = byKey.get(candidate.key) ?? [];
    list.push(candidate);
    byKey.set(candidate.key, list);
  }
  const themes: Theme[] = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => evidenceRank(b) - evidenceRank(a) || a.phrase.length - b.phrase.length);
    const evidence: Evidence[] = [];
    for (const candidate of list) {
      for (const e of candidate.evidence) if (!evidence.some((x) => x.kind === e.kind && x.quote === e.quote)) evidence.push(e);
    }
    themes.push({ id: slug(key), key, phrases: list.map((c) => c.phrase), evidence });
  }
  return themes.sort((a, b) => themeEvidenceRank(b) - themeEvidenceRank(a));
}

function themeEvidenceRank(theme: Theme): number {
  return evidenceRank({ phrase: '', key: theme.key, evidence: theme.evidence });
}

/** Phrases to measure, strongest themes first, capped so the estimate holds. */
export function demandPhrases(themes: Theme[], max = MAX_DEMAND_PHRASES): string[] {
  const phrases: string[] = [];
  // First pass: the lead phrase of every theme; second pass: the remaining variants.
  for (const theme of themes) if (phrases.length < max) phrases.push(theme.phrases[0]);
  for (const theme of themes) for (const phrase of theme.phrases.slice(1)) if (phrases.length < max && !phrases.includes(phrase)) phrases.push(phrase);
  return phrases;
}

export function strengthOf(evidence: Evidence[]): Strength {
  const hasGbp = evidence.some((e) => GBP_KINDS.has(e.kind));
  const hasPrimary = evidence.some((e) => e.kind === 'gbp_categoria_principal');
  const siteKinds = new Set(evidence.filter((e) => SITE_KINDS.has(e.kind)).map((e) => `${e.kind}:${e.quote}`));
  const hasDescription = evidence.some((e) => e.kind === 'gbp_descricao');
  if ((hasGbp && siteKinds.size > 0) || hasPrimary) return 'forte';
  if (hasGbp || siteKinds.size >= 2 || (siteKinds.size >= 1 && hasDescription)) return 'media';
  return 'fraca';
}

const TIER: Record<Strength, number> = { forte: 3, media: 2, fraca: 1 };
const STRENGTH_LABEL: Record<Strength, string> = { forte: 'forte', media: 'média', fraca: 'fraca' };

function isInformational(intent: string | null): boolean {
  return intent === 'informational';
}

/** Representative query: the phrase with demand, preferring non-informational intent, then the shortest. */
export function pickRepresentative(theme: Theme, demand: Map<string, Demand>): { phrase: string; demand: Demand } {
  const empty: Demand = { volume: null, intent: null, competition: null };
  const options = theme.phrases.map((phrase, order) => ({ phrase, order, demand: demand.get(matchForm(phrase)) ?? empty }));
  const withVolume = options.filter((o) => (o.demand.volume ?? 0) > 0);
  if (withVolume.length === 0) return options[0];
  const local = withVolume.filter((o) => !isInformational(o.demand.intent));
  const pool = local.length > 0 ? local : withVolume;
  pool.sort((a, b) => (b.demand.volume ?? 0) - (a.demand.volume ?? 0) || a.phrase.length - b.phrase.length || a.order - b.order);
  return pool[0];
}

function describeEvidence(evidence: Evidence[]): string {
  const parts: string[] = [];
  if (evidence.some((e) => e.kind === 'gbp_categoria_principal')) parts.push('categoria principal do perfil');
  if (evidence.some((e) => e.kind === 'gbp_categoria_adicional')) parts.push('categoria adicional do perfil');
  if (evidence.some((e) => e.kind === 'gbp_descricao')) parts.push('descrição do perfil');
  const site = evidence.filter((e) => SITE_KINDS.has(e.kind)).length;
  if (site > 0) parts.push(site === 1 ? '1 menção no site' : `${site} menções no site`);
  return parts.join(', ');
}

function formatVolume(volume: number | null): string {
  if (volume === null) return 'sem volume medido';
  return `${volume.toLocaleString('pt-BR')} buscas/mês (nacional)`;
}

/**
 * Selects 3-5 themes. Weak themes (a single website mention) need measured demand to be eligible.
 * Fewer than three is returned as a "focado" scope with the reason, never padded.
 */
export function selectThemes(
  themes: Theme[],
  demand: Map<string, Demand>,
  context: { hasGbp: boolean; hasWebsite: boolean },
): Selection {
  const scored = themes.map((theme) => {
    const representative = pickRepresentative(theme, demand);
    const evidence = [...theme.evidence];
    if ((representative.demand.volume ?? 0) > 0) {
      evidence.push({ kind: 'volume', quote: formatVolume(representative.demand.volume), source: 'DataForSEO Labs (keyword_overview)' });
    }
    return { theme, representative, evidence, strength: strengthOf(theme.evidence) };
  });

  const eligible = scored.filter((s) => s.strength !== 'fraca' || (s.representative.demand.volume ?? 0) > 0);
  const ineligible = scored.filter((s) => !eligible.includes(s));
  eligible.sort((a, b) =>
    TIER[b.strength] - TIER[a.strength]
    || (b.representative.demand.volume ?? -1) - (a.representative.demand.volume ?? -1)
    || b.theme.evidence.length - a.theme.evidence.length);

  const chosen = eligible.slice(0, MAX_THEMES);
  const selected: SelectedTheme[] = chosen.map((s) => {
    const variants = s.theme.phrases.filter((p) => p !== s.representative.phrase);
    const volumeText = s.representative.demand.volume === null
      ? 'Sem volume medido: a oferta tem evidência, mas a demanda é desconhecida (não é motivo para descartar).'
      : `${formatVolume(s.representative.demand.volume)}${isInformational(s.representative.demand.intent) ? ', intenção informacional' : ''}.`;
    return {
      id: s.theme.id,
      label: s.theme.phrases[0],
      query: s.representative.phrase,
      volume: s.representative.demand.volume,
      intent: s.representative.demand.intent,
      competition: s.representative.demand.competition,
      strength: s.strength,
      evidence: s.evidence,
      variants,
      reason: `Evidência ${STRENGTH_LABEL[s.strength]}: ${describeEvidence(s.theme.evidence)}. ${volumeText}`
        + (variants.length ? ` ${variants.length === 1 ? '1 variação agrupada' : `${variants.length} variações agrupadas`} (sinônimo, plural ou ordem das palavras), sem virar tema extra.` : ''),
    };
  });

  const dropped: DroppedTheme[] = [
    ...eligible.slice(MAX_THEMES).map((s) => ({
      query: s.representative.phrase, strength: s.strength, volume: s.representative.demand.volume, evidence: s.evidence,
      reason: `Fora do limite de ${MAX_THEMES} temas: evidência ou demanda menor que a dos temas escolhidos.`,
    })),
    ...ineligible.map((s) => ({
      query: s.representative.phrase, strength: s.strength, volume: s.representative.demand.volume, evidence: s.evidence,
      reason: 'Uma única menção no site e sem volume de buscas medido: precisa de mais evidência antes de virar tema.',
    })),
  ];

  let scope: Selection['scope'] = 'completo';
  let fewerReason: string | null = null;
  if (selected.length === 0) {
    scope = 'sem_evidencia';
    fewerReason = missingEvidence(context) || 'Nenhuma oferta com evidência suficiente foi encontrada no perfil nem no site.';
  } else if (selected.length < MIN_THEMES) {
    scope = 'focado';
    const missing = missingEvidence(context);
    fewerReason = `O perfil e o site sustentam só ${selected.length === 1 ? '1 tema distinto' : `${selected.length} temas distintos`}.`
      + (missing ? ` ${missing}` : '')
      + (ineligible.length ? ` ${ineligible.length === 1 ? '1 tema ficou' : `${ineligible.length} temas ficaram`} de fora por falta de evidência.` : '')
      + ' Estudo focado: não completamos a lista com sinônimos.';
  }

  const sources = [context.hasGbp ? 'perfil do Google' : null, context.hasWebsite ? 'site' : null].filter(Boolean).join(' e ');
  const coverage = `${themes.length === 1 ? '1 tema encontrado' : `${themes.length} temas encontrados`} a partir de ${sources || 'nenhuma fonte'}; `
    + `${selected.length === 1 ? '1 escolhido' : `${selected.length} escolhidos`}, ${dropped.length === 1 ? '1 deixado de fora' : `${dropped.length} deixados de fora`}.`;

  return { selected, dropped, scope, fewerReason, coverage };
}

function missingEvidence(context: { hasGbp: boolean; hasWebsite: boolean }): string {
  const parts: string[] = [];
  if (!context.hasGbp) parts.push('O perfil do Google não foi encontrado ou não tem categorias.');
  if (!context.hasWebsite) parts.push('O site não pôde ser lido, então os serviços não foram verificados nele.');
  return parts.join(' ');
}
