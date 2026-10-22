// Homepage capture: free direct HTML fetch (like tools/study.py `website`), with DataForSEO
// on_page/instant_pages as the paid fallback. Retrieval failures are recorded, never turned into
// evidence that the business lacks an offering.
import type { WebsiteCapture } from './types';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', ccedil: 'ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const NAV_PATH = /(servic|tratament|especialidad|procediment|produt|solucoes|solucao|cardapio|menu|atuacao|area|treatment|service)/i;

/** Extracts title, meta description, H1/H2 and internal links that look like offering pages. */
export function parseHomepage(html: string, pageUrl: string): WebsiteCapture {
  const body = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const meta = body.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0].match(/content=["']([^"']*)["']/i)?.[1]
    ?? body.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1];
  const headings = (tag: 'h1' | 'h2') => [...body.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))]
    .map((m) => cleanText(m[1]))
    .filter((t) => t.length >= 3 && t.length <= 120);

  let base: URL | null = null;
  try { base = new URL(pageUrl); } catch { base = null; }
  const links: Array<{ text: string; href: string }> = [];
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!base) break;
    const text = cleanText(m[2]);
    if (text.length < 3 || text.length > 60 || text.split(' ').length > 6) continue;
    let href: URL;
    try { href = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (href.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    if (href.pathname === '/' || href.pathname === base.pathname) continue;
    // Service pages: an offering-like path, or a short menu label pointing one or two levels deep.
    const path = decodeURIComponent(href.pathname).normalize('NFD').replace(/[̀-ͯ]/g, '');
    const depth = path.split('/').filter(Boolean).length;
    if (!NAV_PATH.test(path) && (depth > 2 || text.split(' ').length > 4 || /\.(pdf|jpe?g|png|webp|zip)$/i.test(path))) continue;
    if (!links.some((l) => l.text.toLowerCase() === text.toLowerCase())) links.push({ text, href: href.toString() });
    if (links.length >= 40) break;
  }

  const unique = (list: string[]) => [...new Set(list)].slice(0, 30);
  return {
    url: pageUrl,
    title: title ? cleanText(title) : null,
    metaDescription: meta ? cleanText(meta) : null,
    h1: unique(headings('h1')),
    h2: unique(headings('h2')),
    links,
    via: 'direto',
  };
}

export function hasContent(capture: WebsiteCapture): boolean {
  return !!capture.title || capture.h1.length > 0 || capture.h2.length > 0 || capture.links.length > 0;
}

/** Shape of one on_page/instant_pages item, reduced to what the capture needs. */
export interface InstantPageItem {
  url?: string;
  meta?: { title?: string; description?: string; htags?: Record<string, string[] | undefined> };
}

export function captureFromInstantPage(item: InstantPageItem, url: string): WebsiteCapture {
  return {
    url: item.url ?? url,
    title: item.meta?.title ?? null,
    metaDescription: item.meta?.description ?? null,
    h1: (item.meta?.htags?.h1 ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 30),
    h2: (item.meta?.htags?.h2 ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 30),
    links: [],
    via: 'instant_pages',
  };
}

/** "exemplo.com.br" -> "https://exemplo.com.br/". Null when not a public http(s) URL. */
export function normalizeWebsite(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (!isPublicHostname(url.hostname)) return null;
  return url.toString();
}

/** Rejects localhost, bare names and private/link-local IP literals (the server fetches this URL). */
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  if (host.includes(':')) {
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host === '::') return false;
  }
  return true;
}

export type HtmlFetcher = (url: string) => Promise<{ html?: string; finalUrl?: string; error?: string }>;

const MAX_BYTES = 3_000_000;

/** Direct GET of a public homepage: 15 s timeout, 3 MB cap, HTML only. */
export const fetchHomepage: HtmlFetcher = async (url) => {
  if (!normalizeWebsite(url)) return { error: 'URL do site inválida ou não pública.' };
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Nexo research/1.0)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { error: `O site respondeu HTTP ${response.status}.` };
    const finalUrl = response.url || url;
    try {
      if (!isPublicHostname(new URL(finalUrl).hostname)) return { error: 'O site redirecionou para um endereço não público.' };
    } catch { /* keep the original URL */ }
    const type = response.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) return { error: `O site não devolveu HTML (${type}).` };
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) return { error: 'A página inicial é grande demais para ler.' };
    const html = await response.text();
    return { html: html.slice(0, MAX_BYTES), finalUrl };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return { error: 'O site demorou mais de 15 s para responder.' };
    return { error: error instanceof Error ? `Falha ao ler o site: ${error.message}` : 'Falha ao ler o site.' };
  }
};
