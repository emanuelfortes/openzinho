// Review request kit: the Google "write a review" link, WhatsApp and e-mail texts. Pure, safe for
// any component. Nothing here sends anything: the user opens the links in their own apps.

export type ReviewLinkKind = 'place_id' | 'cid';

export interface ReviewLink {
  url: string;
  kind: ReviewLinkKind;
  /** Shown next to the link when it is a fallback. */
  note: string | null;
}

/** Google place IDs: letters, digits, "_" and "-", usually starting with "ChIJ". */
const PLACE_ID = /^[A-Za-z0-9_-]{16,300}$/;
/** CIDs are decimal (as DataForSEO returns them) or the 0x… hex form seen in Maps URLs. */
const CID_DECIMAL = /^\d{5,25}$/;

/** Accepts a bare place ID or a URL that carries one (placeid=, place_id=, query_place_id=). */
export function parsePlaceId(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const fromUrl = /[?&](?:placeid|place_id|query_place_id)=([A-Za-z0-9_-]+)/i.exec(text);
  const candidate = fromUrl ? fromUrl[1] : text;
  if (CID_DECIMAL.test(candidate)) return null;
  return PLACE_ID.test(candidate) ? candidate : null;
}

/** Accepts a decimal CID or a Maps URL with ?cid=. */
export function parseCid(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const fromUrl = /[?&]cid=(\d+)/i.exec(text);
  const candidate = fromUrl ? fromUrl[1] : text;
  return CID_DECIMAL.test(candidate) ? candidate : null;
}

export function writeReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

export function mapsCidUrl(cid: string): string {
  return `https://maps.google.com/?cid=${encodeURIComponent(cid)}`;
}

/**
 * The place ID opens the review form directly. With only a CID the best Google offers is the
 * profile on Maps, where the customer still has to tap "Escrever uma avaliação".
 */
export function buildReviewLink(input: { placeId?: string | null; cid?: string | null }): ReviewLink | null {
  const placeId = parsePlaceId(input.placeId);
  if (placeId) return { url: writeReviewUrl(placeId), kind: 'place_id', note: null };
  const cid = parseCid(input.cid);
  if (cid) {
    return {
      url: mapsCidUrl(cid),
      kind: 'cid',
      note: 'Só o CID é conhecido: o link abre o perfil no Google Maps e o cliente precisa tocar em "Escrever uma avaliação". Para abrir o formulário direto, informe o place ID.',
    };
  }
  return null;
}

export function defaultWhatsAppMessage(business: string, link: string): string {
  const name = business.trim() || 'nossa empresa';
  return `Olá! Obrigado por escolher ${name}. Sua opinião ajuda muito outras pessoas a nos conhecerem. Você pode deixar uma avaliação no Google? Leva menos de um minuto: ${link}`;
}

/** Digits only, with the Brazilian country code added to 10/11-digit numbers. Null when unusable. */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return withCountry.length >= 12 && withCountry.length <= 15 ? withCountry : null;
}

/** wa.me link with the message filled in; without a phone WhatsApp asks whom to send it to. */
export function whatsAppLink(message: string, phone?: string | null): string {
  const number = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(message)}`;
}

export interface EmailTemplate {
  subject: string;
  body: string;
}

export function defaultEmailTemplate(business: string, link: string): EmailTemplate {
  const name = business.trim() || 'nossa empresa';
  return {
    subject: `Como foi sua experiência com ${name}?`,
    body: [
      'Olá,',
      '',
      `Obrigado por escolher ${name}. Queremos saber como foi a sua experiência.`,
      '',
      'Se puder, deixe uma avaliação no Google pelo link abaixo. Leva menos de um minuto e ajuda outras pessoas a nos encontrarem:',
      '',
      link,
      '',
      'Muito obrigado!',
      name,
    ].join('\n'),
  };
}

/** mailto: with subject and body; line breaks become CRLF as RFC 6068 asks. */
export function mailtoLink(template: EmailTemplate, to?: string | null): string {
  const recipient = (to ?? '').trim();
  const safeTo = /^[^\s@<>(),;:"?&]+@[^\s@<>(),;:"?&]+$/.test(recipient) ? recipient : '';
  const params = [
    `subject=${encodeURIComponent(template.subject)}`,
    `body=${encodeURIComponent(template.body.replace(/\r?\n/g, '\r\n'))}`,
  ];
  return `mailto:${safeTo}?${params.join('&')}`;
}

/** File-name stem for downloads ("Padaria São João" → "padaria-sao-joao"). */
export function fileStem(text: string, fallback = 'avaliacao'): string {
  const stem = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return stem.slice(0, 60) || fallback;
}
