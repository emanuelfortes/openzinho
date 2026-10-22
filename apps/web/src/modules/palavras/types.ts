// Shared, client-safe types for the keyword suggestion research ("Sugestão de palavras-chave").
// Port of the Python study workflow (docs/QUERY_SELECTION_POLICY.md): evidence first, then
// 3-5 distinct themes with one representative query each.

export type EvidenceKind =
  | 'gbp_categoria_principal'
  | 'gbp_categoria_adicional'
  | 'gbp_descricao'
  | 'site_titulo'
  | 'site_meta'
  | 'site_h1'
  | 'site_h2'
  | 'site_link'
  | 'volume'
  | 'maps';

/** One measured observation that supports a candidate. `quote` is the original text. */
export interface Evidence {
  kind: EvidenceKind;
  quote: string;
  /** Where it was read: page URL, "Perfil no Google" or the endpoint. */
  source: string;
}

export interface Candidate {
  /** Lowercase search form shown to the user and sent to the demand endpoint. */
  phrase: string;
  /** Theme key: normalized, synonym-mapped, sorted concept tokens. */
  key: string;
  evidence: Evidence[];
}

export interface RejectedCandidate {
  text: string;
  reason: string;
}

export interface Demand {
  volume: number | null;
  intent: string | null;
  competition: string | null;
}

export type Strength = 'forte' | 'media' | 'fraca';

export interface Theme {
  id: string;
  key: string;
  /** Every phrase grouped here (synonyms, plurals, accents, word order). */
  phrases: string[];
  evidence: Evidence[];
}

export interface MapsProbe {
  query: string;
  status: 'ok' | 'erro';
  error?: string;
  resultCount: number;
  /** 1-based position of the target business in the returned list, or null if absent. */
  targetPosition: number | null;
  topCategories: string[];
}

export interface SelectedTheme {
  id: string;
  label: string;
  query: string;
  volume: number | null;
  intent: string | null;
  competition: string | null;
  strength: Strength;
  evidence: Evidence[];
  /** Other phrases of the same theme, not measured separately. */
  variants: string[];
  /** Plain-language explanation of the pick. */
  reason: string;
  probe?: MapsProbe;
}

export interface DroppedTheme {
  query: string;
  strength: Strength;
  volume: number | null;
  evidence: Evidence[];
  reason: string;
}

export interface Selection {
  selected: SelectedTheme[];
  dropped: DroppedTheme[];
  /** "completo" = 3-5 themes; "focado" = fewer, with `fewerReason`. */
  scope: 'completo' | 'focado' | 'sem_evidencia';
  fewerReason: string | null;
  coverage: string;
}

export interface GbpProfile {
  title: string;
  category: string | null;
  additionalCategories: string[];
  description: string | null;
  url: string | null;
  domain: string | null;
  address: string | null;
  cid: string | null;
}

export interface WebsiteCapture {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2: string[];
  /** Internal links that look like service pages: anchor text and absolute URL. */
  links: Array<{ text: string; href: string }>;
  /** "direto" = free direct HTML fetch; "instant_pages" = DataForSEO fallback. */
  via: 'direto' | 'instant_pages';
}

export interface SourceLog {
  step: 'gbp' | 'site' | 'demanda' | 'maps';
  endpoint: string;
  status: 'ok' | 'erro' | 'pulado';
  message?: string;
  costUsd: number | null;
  observedAt: string;
}

export interface ResearchInput {
  business: string;
  cid: string | null;
  website: string;
  location: string;
  language: string;
  mapsProbe: boolean;
}

export interface ResearchResult {
  input: ResearchInput;
  labsLocation: string;
  gbp: GbpProfile | null;
  website: WebsiteCapture | null;
  candidates: Candidate[];
  rejected: RejectedCandidate[];
  selection: Selection;
  sources: SourceLog[];
  totalCostUsd: number;
  limitations: string[];
  observedAt: string;
}

export interface EstimateLine {
  key: 'gbp' | 'site' | 'demanda' | 'maps';
  label: string;
  endpoint: string;
  quantity: number;
  unitUsd: number;
  usd: number;
  optional: boolean;
  note: string;
}

export interface Estimate {
  lines: EstimateLine[];
  totalUsd: number;
}
