import { describe, expect, it } from 'vitest';
import { brandWords, buildCandidates, splitSegments } from './candidates';
import { GBP_FIXTURE, HOMEPAGE_HTML } from './fixtures';
import { captureFromInstantPage, isPublicHostname, normalizeWebsite, parseHomepage } from './website';

const LOCATION = 'Sao Paulo,State of Sao Paulo,Brazil';

describe('parseHomepage', () => {
  const site = parseHomepage(HOMEPAGE_HTML, 'https://sorrisofeliz.com.br/');

  it('reads title, meta description and headings, ignoring scripts', () => {
    expect(site.title).toBe('Clínica Sorriso Feliz | Dentista em São Paulo - Implantes e Clareamento');
    expect(site.metaDescription).toContain('implante dentário');
    expect(site.h1).toEqual(['Dentistas em São Paulo']);
    expect(site.h2).toContain('Ortodontia');
    expect(site.h2).not.toContain('não é cabeçalho');
  });

  it('keeps internal service links only', () => {
    expect(site.links.map((l) => l.text)).toEqual(['Implante dentário', 'Clareamento dental', 'Lentes de contato dental', 'Fale conosco']);
    expect(site.links[0].href).toBe('https://sorrisofeliz.com.br/servicos/implante-dentario');
  });

  it('maps the instant_pages fallback', () => {
    const capture = captureFromInstantPage({ meta: { title: 'T', htags: { h1: ['Dentista'], h2: ['Implantes'] } } }, 'https://x.com.br/');
    expect(capture).toMatchObject({ title: 'T', h1: ['Dentista'], h2: ['Implantes'], via: 'instant_pages' });
  });

  it('only accepts public http(s) websites', () => {
    expect(normalizeWebsite('sorrisofeliz.com.br')).toBe('https://sorrisofeliz.com.br/');
    expect(normalizeWebsite('http://localhost:3000')).toBeNull();
    expect(normalizeWebsite('http://192.168.0.1')).toBeNull();
    expect(normalizeWebsite('ftp://x.com')).toBeNull();
    expect(normalizeWebsite('https://user:pw@x.com')).toBeNull();
    expect(isPublicHostname('8.8.8.8')).toBe(true);
  });
});

describe('buildCandidates', () => {
  const site = parseHomepage(HOMEPAGE_HTML, 'https://sorrisofeliz.com.br/');
  const { candidates, rejected } = buildCandidates({ gbp: GBP_FIXTURE, site, businessName: 'Clínica Sorriso Feliz', location: LOCATION });
  const byPhrase = new Map(candidates.map((c) => [c.phrase, c]));

  it('splits titles into segments', () => {
    expect(splitSegments('Clínica Sorriso | Dentista em São Paulo - Implantes e Clareamento')).toEqual(['Clínica Sorriso', 'Dentista em São Paulo', 'Implantes', 'Clareamento']);
  });

  it('extracts GBP categories and website offerings with their evidence', () => {
    expect(byPhrase.get('dentista')?.evidence.map((e) => e.kind)).toEqual(expect.arrayContaining(['gbp_categoria_principal', 'site_titulo']));
    expect(byPhrase.get('clínica odontológica')?.evidence[0].kind).toBe('gbp_categoria_adicional');
    expect(byPhrase.get('implante dentário')?.evidence.map((e) => e.kind)).toEqual(expect.arrayContaining(['site_link', 'gbp_descricao']));
    expect(byPhrase.has('ortodontia')).toBe(true);
    expect(byPhrase.has('dentistas')).toBe(true);
  });

  it('rejects the brand and navigation copy, with reasons', () => {
    expect([...byPhrase.keys()].some((p) => p.includes('sorriso'))).toBe(false);
    expect(rejected.find((r) => r.text === 'Clínica Sorriso Feliz')?.reason).toMatch(/marca/);
    expect(rejected.find((r) => r.text === 'Fale conosco')?.reason).toMatch(/navegação/);
    expect(rejected.find((r) => r.text === 'Nossa equipe')).toBeDefined();
  });

  it('brand words exclude category words', () => {
    expect([...brandWords('Dentista Silva', ['Dentista'])]).toEqual(['silva']);
    expect([...brandWords('Odonto Sorriso', ['Dentista'])]).toEqual(['sorriso']);
  });
});
