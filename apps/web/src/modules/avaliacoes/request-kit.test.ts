import { describe, expect, it } from 'vitest';
import {
  buildReviewLink, defaultEmailTemplate, defaultWhatsAppMessage, fileStem, mailtoLink, normalizeWhatsAppPhone,
  parseCid, parsePlaceId, whatsAppLink,
} from './request-kit';
import { qrSvg } from './qr';

const PLACE = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

describe('parsePlaceId / parseCid', () => {
  it('accepts bare IDs and IDs inside URLs', () => {
    expect(parsePlaceId(` ${PLACE} `)).toBe(PLACE);
    expect(parsePlaceId(`https://search.google.com/local/writereview?placeid=${PLACE}`)).toBe(PLACE);
    expect(parsePlaceId(`https://www.google.com/maps/search/?api=1&query=x&query_place_id=${PLACE}`)).toBe(PLACE);
    expect(parseCid('https://maps.google.com/?cid=1234567890123456789')).toBe('1234567890123456789');
  });

  it('rejects junk and does not take a CID for a place ID', () => {
    expect(parsePlaceId('')).toBeNull();
    expect(parsePlaceId('abc def')).toBeNull();
    expect(parsePlaceId('1234567890123456789')).toBeNull();
    expect(parseCid('ChIJabc')).toBeNull();
  });
});

describe('buildReviewLink', () => {
  it('opens the review form from a place ID', () => {
    expect(buildReviewLink({ placeId: PLACE, cid: '123456789' })).toEqual({
      url: `https://search.google.com/local/writereview?placeid=${PLACE}`, kind: 'place_id', note: null,
    });
  });

  it('falls back to the Maps profile from a CID and says so', () => {
    const link = buildReviewLink({ cid: '1234567890123456789' });
    expect(link?.kind).toBe('cid');
    expect(link?.url).toBe('https://maps.google.com/?cid=1234567890123456789');
    expect(link?.note).toContain('place ID');
  });

  it('returns null without an identifier', () => {
    expect(buildReviewLink({})).toBeNull();
  });
});

describe('WhatsApp', () => {
  it('normalizes Brazilian numbers', () => {
    expect(normalizeWhatsAppPhone('(11) 98765-4321')).toBe('5511987654321');
    expect(normalizeWhatsAppPhone('+55 11 98765-4321')).toBe('5511987654321');
    expect(normalizeWhatsAppPhone('123')).toBeNull();
  });

  it('builds a wa.me link with the encoded message', () => {
    const message = defaultWhatsAppMessage('Padaria São João', 'https://exemplo.com/a?b=1&c=2');
    expect(message).toContain('Padaria São João');
    const link = whatsAppLink(message);
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe(message);
    expect(whatsAppLink('oi', '11987654321')).toBe('https://wa.me/5511987654321?text=oi');
  });
});

describe('e-mail', () => {
  it('builds a mailto with subject and CRLF body', () => {
    const template = defaultEmailTemplate('Clínica Sorriso', 'https://exemplo.com/r');
    expect(template.subject).toContain('Clínica Sorriso');
    const link = mailtoLink(template, 'cliente@exemplo.com');
    expect(link.startsWith('mailto:cliente@exemplo.com?subject=')).toBe(true);
    const body = decodeURIComponent(link.split('body=')[1]);
    expect(body).toContain('\r\nhttps://exemplo.com/r\r\n');
  });

  it('drops an unsafe recipient', () => {
    expect(mailtoLink({ subject: 'a', body: 'b' }, 'x@y.com?bcc=z@w.com')).toBe('mailto:?subject=a&body=b');
  });
});

describe('fileStem', () => {
  it('makes a safe file name', () => {
    expect(fileStem('Padaria São João!')).toBe('padaria-sao-joao');
    expect(fileStem('***')).toBe('avaliacao');
  });
});

describe('qrSvg', () => {
  it('renders an SVG QR code', async () => {
    const svg = await qrSvg(`https://search.google.com/local/writereview?placeid=${PLACE}`);
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(svg).toContain('#030508');
  });
});
