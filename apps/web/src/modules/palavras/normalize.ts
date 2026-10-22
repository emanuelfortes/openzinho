// Text normalization for Brazilian Portuguese search terms: accents, plurals, word order and
// synonym families, so "dentista", "dentistas" and "consultório odontológico" share one theme.

/** Lowercase, no accents, punctuation turned into spaces, single spaces. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/24\s*horas/g, '24h')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'pro',
  'por', 'pelo', 'pela', 'com', 'sem', 'um', 'uma', 'uns', 'umas', 'ao', 'aos', 'seu', 'sua', 'seus', 'suas', 'nosso',
  'nossa', 'nossos', 'nossas', 'que', 'ou', 'the', 'and', 'of', 'for', 'in', 'your', 'our', 'mais', 'sobre', 'voce', 'sp',
]);

/** Words that only describe the kind of place ("clínica", "consultório"): dropped when a concept remains. */
export const CONTAINER_WORDS = new Set([
  'clinica', 'consultorio', 'centro', 'servico', 'empresa', 'loja', 'especialista', 'profissional', 'atendimento',
  'tratamento', 'escritorio', 'oficina', 'instituto', 'grupo', 'rede', 'unidade', 'espaco', 'studio', 'estudio',
  'solucao', 'agencia', 'casa', 'especializado', 'especializada', 'local',
]);

/** Search modifiers that never create a new theme ("perto de mim", "melhor", "barato"). */
export const MODIFIER_WORDS = new Set([
  'perto', 'mim', 'proximo', 'proxima', 'melhor', 'barato', 'barata', 'preco', 'valor', 'bom', 'boa', 'regiao', 'aqui',
]);

/** Navigation and marketing copy that is not an offering. */
export const GENERIC_WORDS = new Set([
  'inicio', 'home', 'contato', 'sobre', 'quem', 'somos', 'equipe', 'blog', 'noticia', 'depoimento', 'avaliacao',
  'galeria', 'foto', 'agende', 'agendar', 'agendamento', 'consulta', 'fale', 'conosco', 'whatsapp', 'ligue', 'telefone',
  'endereco', 'localizacao', 'horario', 'funcionamento', 'pergunta', 'frequente', 'faq', 'duvida', 'missao', 'visao',
  'politica', 'privacidade', 'termo', 'uso', 'cookie', 'login', 'entrar', 'cadastro', 'carrinho', 'bem', 'vindo',
  'vinda', 'conheca', 'saiba', 'veja', 'clique', 'diferencial', 'vantagem', 'porque', 'escolher', 'historia',
  'trabalhe', 'carreira', 'parceiro', 'cliente', 'resultado', 'case', 'portfolio', 'mapa', 'site', 'pagina', 'menu',
  'voltar', 'topo', 'ver', 'todo', 'leia', 'inscreva', 'newsletter', 'siga', 'social', 'instagram', 'facebook',
  'youtube', 'linkedin', 'copyright', 'direito', 'reservado', 'oferecemos', 'servico', 'produto', 'area', 'atuacao',
  'nosso', 'nossa', 'aqui', 'agora', 'hoje', 'online', 'orcamento', 'gratis', 'promocao', 'oferta', 'novidade',
  'especialidade', 'solucao', 'comprar', 'compre', 'loja', 'busca', 'buscar', 'pesquisar', 'obrigado', 'erro',
  'acessar', 'conta', 'minha', 'meu', 'mapa', 'chegar', 'como', 'qual', 'quando', 'onde', 'tudo', 'voce', 'precisa',
  'cuidado', 'qualidade', 'excelencia', 'experiencia', 'confianca', 'compromisso', 'atendimento', 'unidade', 'evento',
]);

/** Brazilian state abbreviations, removed from candidates as location words. */
const UF = new Set(['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'se', 'to']);

/** Singular form of a folded Portuguese word (rules good enough for search terms). */
export function singular(word: string): string {
  if (word.length <= 3 || !word.endsWith('s')) return word;
  const rules: Array<[RegExp, string]> = [
    [/oes$/, 'ao'], [/aes$/, 'ao'], [/aos$/, 'ao'], [/ais$/, 'al'], [/eis$/, 'el'], [/ois$/, 'ol'], [/uis$/, 'ul'],
    [/ns$/, 'm'], [/([rz])es$/, '$1'], [/ses$/, 's'],
  ];
  for (const [pattern, replacement] of rules) if (pattern.test(word)) return word.replace(pattern, replacement);
  if (/(is|us|ss)$/.test(word)) return word;
  return word.slice(0, -1);
}

/** Cross-root synonym families: [canonical concept, folded singular prefixes]. */
const FAMILIES: Array<[string, string[]]> = [
  ['odonto', ['dentist', 'dental', 'dentari', 'dente', 'odonto', 'odontolog']],
  ['ortodontia', ['ortodont']],
  ['implante', ['implant']],
  ['advocacia', ['advog', 'advocac', 'juridic']],
  ['contabilidade', ['contab', 'contador']],
  ['veterinaria', ['veterin']],
  ['mecanica', ['mecanic', 'automotiv']],
  ['pizza', ['pizz']],
  ['hamburguer', ['hamburg', 'burger']],
  ['barbearia', ['barbear', 'barbeir']],
  ['cabeleireiro', ['cabeleir']],
  ['psicologia', ['psicolog', 'psicoterap']],
  ['fisioterapia', ['fisioterap']],
  ['nutricao', ['nutricion', 'nutrolog', 'nutricao']],
  ['dermatologia', ['dermatolog']],
  ['pediatria', ['pediatr']],
  ['farmacia', ['farmac', 'drogaria']],
  ['otica', ['otica', 'oculo']],
  ['imobiliaria', ['imobiliar', 'imovel']],
  ['encanador', ['encanad', 'hidraulic']],
  ['eletricista', ['eletric']],
  ['urgencia', ['urgenc', 'emergenc', '24h', 'plantao']],
  ['entrega', ['entrega', 'delivery', 'teleentrega']],
  ['academia', ['academia', 'musculac', 'ginastic']],
  ['estetica', ['estetic']],
  ['restaurante', ['restaurant']],
  ['padaria', ['padaria', 'panificador']],
  ['chaveiro', ['chaveir']],
  ['fotografia', ['fotograf']],
];

const SUFFIXES = ['ologista', 'ologica', 'ologico', 'ologia', 'ologo', 'idade', 'ista', 'aria', 'ario', 'eira', 'eiro', 'ica', 'ico', 'ia', 'al', 'a', 'o', 'e'];

/** Concept for one folded singular word: a synonym family, or a light stem of the word. */
export function concept(word: string): string {
  for (const [canonical, prefixes] of FAMILIES) {
    if (prefixes.some((prefix) => word.startsWith(prefix))) return canonical;
  }
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}

export interface PhraseAnalysis {
  /** Lowercase display form, location and modifiers removed, original accents kept. */
  phrase: string;
  /** Concept tokens (sorted, unique) after removing container words; empty when nothing remains. */
  concepts: string[];
  /** Folded singular content words (no stopwords/location/modifiers). */
  words: string[];
  /** Why it is not a search term, if so. */
  problem: 'vazio' | 'generico' | 'longo' | null;
}

/** Folded words of a location string ("Sao Paulo,State of Sao Paulo,Brazil") plus UF codes. */
export function locationWords(location: string): Set<string> {
  const words = new Set<string>(UF);
  for (const word of fold(location).split(' ')) {
    if (word && !STOPWORDS.has(word) && !['state', 'estado', 'city', 'brazil', 'brasil'].includes(word)) words.add(word);
  }
  ['brasil', 'brazil'].forEach((w) => words.add(w));
  return words;
}

export const MAX_CONTENT_WORDS = 4;

/** Breaks a heading/category into its content, dropping location words and modifiers. */
export function analyzePhrase(text: string, location: Set<string>): PhraseAnalysis {
  const original = text.toLowerCase().replace(/\s+/g, ' ').trim().split(' ');
  const kept: string[] = [];
  const words: string[] = [];
  for (const raw of original) {
    const folded = fold(raw);
    if (!folded) continue;
    const parts = folded.split(' ');
    const isNoise = parts.every((p) => location.has(p) || MODIFIER_WORDS.has(p) || /^\d+$/.test(p));
    if (isNoise) continue;
    kept.push(raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    for (const part of parts) if (!STOPWORDS.has(part)) words.push(singular(part));
  }
  // Trim dangling stopwords ("dentista em" after removing the city).
  while (kept.length && STOPWORDS.has(fold(kept[kept.length - 1]))) kept.pop();
  while (kept.length && STOPWORDS.has(fold(kept[0]))) kept.shift();
  const phrase = kept.filter(Boolean).join(' ');
  if (words.length === 0) return { phrase, concepts: [], words, problem: 'vazio' };
  if (words.length > MAX_CONTENT_WORDS) return { phrase, concepts: [], words, problem: 'longo' };
  const meaningful = words.filter((w) => !GENERIC_WORDS.has(w) && !CONTAINER_WORDS.has(w));
  if (meaningful.length === 0) return { phrase, concepts: [], words, problem: 'generico' };
  const concepts = [...new Set(words.filter((w) => !CONTAINER_WORDS.has(w) && !GENERIC_WORDS.has(w)).map(concept))].sort();
  return { phrase, concepts, words, problem: null };
}

/** Theme key: concepts minus the business's core concepts when something more specific remains. */
export function themeKey(concepts: string[], core: Set<string>): string {
  const specific = concepts.filter((c) => !core.has(c));
  return (specific.length > 0 ? specific : concepts).join(' ');
}

/** Accent/case-insensitive comparison form for matching provider keywords back to phrases. */
export function matchForm(text: string): string {
  return fold(text);
}
