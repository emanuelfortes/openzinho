// Candidate search terms from evidence: public GBP categories and the website's title, meta
// description, H1/H2 and service-page links. Brand names are identity controls, not themes.
import { analyzePhrase, fold, locationWords, singular, themeKey, concept, CONTAINER_WORDS, STOPWORDS, GENERIC_WORDS } from './normalize';
import type { Candidate, Evidence, EvidenceKind, GbpProfile, RejectedCandidate, WebsiteCapture } from './types';

export const GBP_SOURCE = 'Perfil da empresa no Google';

const REJECT_REASONS = {
  vazio: 'Só tem nome de local ou modificador ("perto de mim", "melhor"); não é uma oferta.',
  generico: 'Texto de navegação ou institucional, não uma oferta da empresa.',
  longo: 'Frase longa demais para ser um termo de busca.',
  marca: 'Nome da própria empresa: busca de marca serve como controle de identidade, não conta como tema.',
} as const;

/** Splits titles like "Clínica Sorriso | Dentista em São Paulo - Implantes" into segments. */
export function splitSegments(text: string): string[] {
  return text
    .split(/\s[|\-–—:·•/]\s|:\s|[|–—·•]/)
    .flatMap((part) => part.split(/,\s*|\s+e\s+(?=\S)/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && part.length <= 80);
}

/** Title words that identify the brand: not stopwords, container words or category words. */
export function brandWords(title: string, categories: string[]): Set<string> {
  const categoryConcepts = new Set(categories.flatMap((c) => fold(c).split(' ').map((w) => concept(singular(w)))));
  const words = new Set<string>();
  for (const word of fold(title).split(' ')) {
    const s = singular(word);
    if (!s || STOPWORDS.has(s) || CONTAINER_WORDS.has(s) || GENERIC_WORDS.has(s) || categoryConcepts.has(concept(s)) || s.length < 3) continue;
    words.add(s);
  }
  return words;
}

/** Concepts of the GBP primary category: the business's "core" theme ("dentista" -> odonto). */
export function coreConcepts(gbp: GbpProfile | null, location: string): Set<string> {
  if (!gbp?.category) return new Set();
  return new Set(analyzePhrase(gbp.category, locationWords(location)).concepts);
}

/** Neighborhood from a Brazilian GBP address ("Rua X, 100 - Pinheiros, São Paulo - SP"). */
export function neighborhoodWords(address: string | null): string[] {
  const match = address?.match(/\d+[^,]*?\s-\s([^,]+),/);
  return match ? fold(match[1]).split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w)) : [];
}

interface RawMention {
  text: string;
  kind: EvidenceKind;
  source: string;
}

export function mentionsFrom(gbp: GbpProfile | null, site: WebsiteCapture | null): RawMention[] {
  const mentions: RawMention[] = [];
  if (gbp?.category) mentions.push({ text: gbp.category, kind: 'gbp_categoria_principal', source: GBP_SOURCE });
  for (const category of gbp?.additionalCategories ?? []) mentions.push({ text: category, kind: 'gbp_categoria_adicional', source: GBP_SOURCE });
  if (site) {
    const push = (text: string | null | undefined, kind: EvidenceKind, source = site.url) => {
      if (!text) return;
      for (const segment of splitSegments(text)) mentions.push({ text: segment, kind, source });
    };
    push(site.title, 'site_titulo');
    site.h1.forEach((h) => push(h, 'site_h1'));
    site.h2.forEach((h) => push(h, 'site_h2'));
    site.links.forEach((l) => push(l.text, 'site_link', l.href));
    // Meta descriptions are sentences; only short comma-separated lists become candidates.
    if (site.metaDescription && site.metaDescription.length <= 160) push(site.metaDescription, 'site_meta');
  }
  return mentions;
}

/**
 * Builds deduplicated candidates (one per display phrase) with every piece of evidence that
 * mentions them, plus the texts rejected and why. The GBP description only corroborates.
 */
export function buildCandidates(input: {
  gbp: GbpProfile | null;
  site: WebsiteCapture | null;
  businessName: string;
  location: string;
}): { candidates: Candidate[]; rejected: RejectedCandidate[] } {
  const location = locationWords(input.location);
  for (const word of neighborhoodWords(input.gbp?.address ?? null)) location.add(word);
  const categories = [input.gbp?.category, ...(input.gbp?.additionalCategories ?? [])].filter((c): c is string => !!c);
  const brand = brandWords(input.gbp?.title || input.businessName, categories);
  const core = coreConcepts(input.gbp, input.location);
  const byPhrase = new Map<string, Candidate>();
  const rejected = new Map<string, RejectedCandidate>();

  for (const mention of mentionsFrom(input.gbp, input.site)) {
    const analysis = analyzePhrase(mention.text, location);
    const textKey = fold(mention.text);
    if (analysis.problem) {
      // Long marketing sentences from meta descriptions are noise, not worth listing.
      if (mention.kind !== 'site_meta' && !rejected.has(textKey)) rejected.set(textKey, { text: mention.text, reason: REJECT_REASONS[analysis.problem] });
      continue;
    }
    if (analysis.words.some((w) => brand.has(w))) {
      if (!rejected.has(textKey)) rejected.set(textKey, { text: mention.text, reason: REJECT_REASONS.marca });
      continue;
    }
    const phraseKey = fold(analysis.phrase);
    const evidence: Evidence = { kind: mention.kind, quote: mention.text, source: mention.source };
    const existing = byPhrase.get(phraseKey);
    if (existing) {
      if (!existing.evidence.some((e) => e.kind === evidence.kind && e.quote === evidence.quote)) existing.evidence.push(evidence);
      continue;
    }
    byPhrase.set(phraseKey, { phrase: analysis.phrase, key: themeKey(analysis.concepts, core), evidence: [evidence] });
  }

  // The GBP description corroborates candidates it mentions; it never creates one.
  const description = input.gbp?.description ? fold(input.gbp.description) : '';
  if (description) {
    for (const candidate of byPhrase.values()) {
      if (` ${description} `.includes(` ${fold(candidate.phrase)} `)) {
        candidate.evidence.push({ kind: 'gbp_descricao', quote: candidate.phrase, source: GBP_SOURCE });
      }
    }
  }

  return { candidates: [...byPhrase.values()], rejected: [...rejected.values()].slice(0, 30) };
}
