// Client-safe helpers: business identity from a name or Google Maps link, and the hand-off to
// the grid campaign form.

export interface BusinessIdentity {
  /** Name to search when no CID is known. */
  name: string;
  cid: string | null;
}

/**
 * Accepts a business name, "cid:123", or a Google Maps link (…?cid=123, …/place/Name/…,
 * …!1s0x…:0x<hex>…, where the second hex number is the CID).
 */
export function parseBusinessInput(raw: string): BusinessIdentity {
  const text = raw.trim();
  const cidPrefix = text.match(/^cid:\s*(\d{5,25})$/i);
  if (cidPrefix) return { name: '', cid: cidPrefix[1] };
  if (!/^https?:\/\//i.test(text) && !/^(www\.)?google\.[a-z.]+\/maps/i.test(text) && !/maps\.app\.goo\.gl/i.test(text)) {
    return { name: text, cid: null };
  }
  let url: URL | null = null;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { url = null; }
  if (!url) return { name: text, cid: null };
  const cidParam = url.searchParams.get('cid') ?? url.searchParams.get('ludocid');
  if (cidParam && /^\d{5,25}$/.test(cidParam)) return { name: '', cid: cidParam };
  const hex = text.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i);
  let cid: string | null = null;
  if (hex) {
    try { cid = BigInt(`0x${hex[1]}`).toString(); } catch { cid = null; }
  }
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  const name = place ? decodeURIComponent(place.replace(/\+/g, ' ')).trim() : '';
  return { name, cid };
}

/** Link to the campaign form with the chosen queries; the campaigns page reads `new`, `keywords` and `target`. */
export function campaignHref(queries: string[], target: string): string {
  const params = new URLSearchParams({ new: '1', keywords: queries.join(','), target });
  return `/dashboard/campaigns?${params.toString().replace(/\+/g, '%20')}`;
}
