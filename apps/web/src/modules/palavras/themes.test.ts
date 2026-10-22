import { describe, expect, it } from 'vitest';
import { buildCandidates } from './candidates';
import { GBP_FIXTURE, HOMEPAGE_HTML, overviewResult } from './fixtures';
import { parseDemand } from './research';
import { demandPhrases, groupThemes, MAX_THEMES, pickRepresentative, selectThemes, strengthOf } from './themes';
import type { Candidate, Evidence, GbpProfile } from './types';
import { parseHomepage } from './website';

const LOCATION = 'Sao Paulo,State of Sao Paulo,Brazil';
const site = parseHomepage(HOMEPAGE_HTML, 'https://sorrisofeliz.com.br/');
const ev = (kind: Evidence['kind'], quote: string): Evidence => ({ kind, quote, source: 'teste' });

function themesFor(gbp: GbpProfile | null, withSite = true) {
  const { candidates } = buildCandidates({ gbp, site: withSite ? site : null, businessName: gbp?.title ?? 'Clínica Sorriso Feliz', location: LOCATION });
  return groupThemes(candidates);
}

describe('groupThemes', () => {
  it('groups synonyms, plurals and accents into one theme', () => {
    const themes = themesFor(GBP_FIXTURE);
    const core = themes.find((t) => t.phrases.includes('dentista'))!;
    expect(core.phrases).toEqual(expect.arrayContaining(['dentista', 'dentistas', 'clínica odontológica']));
    const implant = themes.find((t) => t.phrases.includes('implante dentário'))!;
    expect(implant.phrases).toEqual(expect.arrayContaining(['implantes dentários', 'implantes']));
    const keys = themes.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('measures every theme lead first, within the cap', () => {
    const themes = themesFor(GBP_FIXTURE);
    const phrases = demandPhrases(themes, 6);
    expect(phrases).toHaveLength(6);
    expect(phrases.slice(0, themes.length > 6 ? 6 : themes.length)).toEqual(themes.slice(0, 6).map((t) => t.phrases[0]));
  });
});

describe('strengthOf', () => {
  it('ranks corroborated evidence above a single website mention', () => {
    expect(strengthOf([ev('gbp_categoria_principal', 'Dentista')])).toBe('forte');
    expect(strengthOf([ev('gbp_categoria_adicional', 'Ortodontista'), ev('site_h2', 'Ortodontia')])).toBe('forte');
    expect(strengthOf([ev('gbp_categoria_adicional', 'Ortodontista')])).toBe('media');
    expect(strengthOf([ev('site_h2', 'Lentes'), ev('site_link', 'Lentes de contato')])).toBe('media');
    expect(strengthOf([ev('site_h2', 'Lentes')])).toBe('fraca');
  });
});

describe('pickRepresentative', () => {
  it('prefers the phrase with demand and non-informational intent', () => {
    const theme = { id: 'odonto', key: 'odonto', phrases: ['clínica odontológica', 'dentista', 'dentistas'], evidence: [] };
    const demand = parseDemand(overviewResult({ 'clinica odontologica': 8100, dentista: 90500, dentistas: 2400 }));
    expect(pickRepresentative(theme, demand).phrase).toBe('dentista');
    const informational = parseDemand(overviewResult({ dentista: 90500, 'clinica odontologica': 8100 }, { dentista: 'informational' }));
    expect(pickRepresentative(theme, informational).phrase).toBe('clínica odontológica');
    expect(pickRepresentative(theme, new Map()).phrase).toBe('clínica odontológica');
  });
});

describe('selectThemes', () => {
  const demand = parseDemand(overviewResult({
    dentista: 90500, dentistas: 2400, 'clínica odontológica': 8100, 'implante dentário': 18100, 'implantes dentários': 1900,
    ortodontista: 9900, ortodontia: 6600, 'clareamento dental': 22200, 'lentes de contato dental': 14800,
  }));

  it('selects 3-5 distinct themes, one query each, never two from the same theme', () => {
    const themes = themesFor(GBP_FIXTURE);
    const selection = selectThemes(themes, demand, { hasGbp: true, hasWebsite: true });
    expect(selection.scope).toBe('completo');
    expect(selection.selected.length).toBeGreaterThanOrEqual(3);
    expect(selection.selected.length).toBeLessThanOrEqual(MAX_THEMES);
    const queries = selection.selected.map((t) => t.query);
    expect(queries).toContain('dentista');
    expect(queries).toContain('implante dentário');
    expect(queries).not.toContain('dentistas');
    expect(queries).not.toContain('clínica odontológica');
    expect(queries).not.toContain('implantes dentários');
    for (const theme of selection.selected) {
      expect(theme.evidence.length).toBeGreaterThan(0);
      expect(theme.reason).toMatch(/Evidência/);
    }
    expect(selection.selected.find((t) => t.query === 'dentista')!.variants).toEqual(expect.arrayContaining(['dentistas', 'clínica odontológica']));
  });

  it('caps at five and explains what was dropped', () => {
    const many: Candidate[] = ['pizza', 'hambúrguer', 'açaí', 'sorvete', 'café', 'pastel', 'tapioca'].map((phrase) => ({
      phrase, key: phrase, evidence: [ev('gbp_categoria_adicional', phrase), ev('site_h2', phrase)],
    }));
    const selection = selectThemes(groupThemes(many), new Map(), { hasGbp: true, hasWebsite: true });
    expect(selection.selected).toHaveLength(5);
    expect(selection.dropped).toHaveLength(2);
    expect(selection.dropped[0].reason).toMatch(/limite de 5/);
  });

  it('returns fewer than three with the reason instead of padding with synonyms', () => {
    const narrow: GbpProfile = { ...GBP_FIXTURE, category: 'Chaveiro', additionalCategories: [], description: null, title: 'Chaves Rápidas' };
    const { candidates } = buildCandidates({
      gbp: narrow,
      site: { url: 'https://chaves.com.br/', title: 'Chaveiro 24 horas', metaDescription: null, h1: ['Chaveiros'], h2: ['Chaveiro perto de mim', 'Cópia de chaves'], links: [], via: 'direto' },
      businessName: 'Chaves Rápidas',
      location: LOCATION,
    });
    const themes = groupThemes(candidates);
    const selection = selectThemes(themes, parseDemand(overviewResult({ chaveiro: 40500, chaveiros: 1000, 'chaveiro 24 horas': 9900 })), { hasGbp: true, hasWebsite: true });
    expect(selection.selected.length).toBeLessThan(3);
    expect(selection.scope).toBe('focado');
    expect(selection.fewerReason).toMatch(/não completamos a lista com sinônimos/);
    const queries = selection.selected.map((t) => t.query);
    expect(queries.filter((q) => q.startsWith('chaveiro')).length).toBeLessThanOrEqual(2);
    expect(queries).not.toContain('chaveiros');
    expect(queries).not.toContain('chaveiro perto de mim');
  });

  it('defers a single website mention without demand, and explains missing sources', () => {
    const only: Candidate[] = [{ phrase: 'harmonização facial', key: 'harmonizaca facial', evidence: [ev('site_h2', 'Harmonização facial')] }];
    const selection = selectThemes(groupThemes(only), new Map(), { hasGbp: false, hasWebsite: true });
    expect(selection.selected).toHaveLength(0);
    expect(selection.scope).toBe('sem_evidencia');
    expect(selection.fewerReason).toMatch(/perfil do Google/);
    expect(selection.dropped[0].reason).toMatch(/única menção/);
  });
});
