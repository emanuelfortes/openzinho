import { describe, expect, it } from 'vitest';
import { analyzePhrase, fold, locationWords, singular, themeKey } from './normalize';
import { campaignHref, parseBusinessInput } from './shared';

const sp = locationWords('Sao Paulo,State of Sao Paulo,Brazil');

describe('fold and singular', () => {
  it('removes accents, case and punctuation', () => {
    expect(fold('Consultório  Odontológico!')).toBe('consultorio odontologico');
    expect(fold('Atendimento 24 horas')).toBe('atendimento 24h');
  });

  it('singularizes common Portuguese plurals', () => {
    expect(singular('dentistas')).toBe('dentista');
    expect(singular('implantes')).toBe('implante');
    expect(singular('lentes')).toBe('lente');
    expect(singular('restauracoes')).toBe('restauracao');
    expect(singular('dentais')).toBe('dental');
    expect(singular('dores')).toBe('dor');
    expect(singular('lapis')).toBe('lapis');
  });
});

describe('analyzePhrase', () => {
  it('drops the city and dangling prepositions but keeps accents in the display form', () => {
    const result = analyzePhrase('Dentista em São Paulo', sp);
    expect(result.phrase).toBe('dentista');
    expect(result.problem).toBeNull();
  });

  it('flags navigation copy, modifiers-only and long sentences', () => {
    expect(analyzePhrase('Fale conosco', sp).problem).toBe('generico');
    expect(analyzePhrase('Nossos serviços', sp).problem).toBe('generico');
    expect(analyzePhrase('perto de mim', sp).problem).toBe('vazio');
    expect(analyzePhrase('Cuidamos do seu sorriso com carinho e muita dedicação', sp).problem).toBe('longo');
  });

  it('maps synonyms, plurals, accents and word order to the same theme key', () => {
    const core = new Set(analyzePhrase('Dentista', sp).concepts);
    const key = (text: string) => themeKey(analyzePhrase(text, sp).concepts, core);
    expect(key('dentista')).toBe(key('Dentistas'));
    expect(key('dentista')).toBe(key('consultório odontológico'));
    expect(key('dentista')).toBe(key('Clínica Odontológica'));
    expect(key('implante dentário')).toBe(key('Implantes dentários'));
    expect(key('clareamento dental')).toBe(key('Clareamento'));
    expect(key('dental clareamento')).toBe(key('clareamento dental'));
    expect(key('ortodontia')).toBe(key('ortodontista'));
    expect(key('implante dentário')).not.toBe(key('dentista'));
    expect(key('dentista perto de mim')).toBe(key('dentista'));
  });
});

describe('shared helpers', () => {
  it('reads a CID or place name from Google Maps links', () => {
    expect(parseBusinessInput('Clínica Sorriso')).toEqual({ name: 'Clínica Sorriso', cid: null });
    expect(parseBusinessInput('cid:1234567890')).toEqual({ name: '', cid: '1234567890' });
    expect(parseBusinessInput('https://maps.google.com/?cid=987654321')).toEqual({ name: '', cid: '987654321' });
    const link = parseBusinessInput('https://www.google.com/maps/place/Cl%C3%ADnica+Sorriso/@-23.5,-46.6,17z/data=!3m1!4b1!4m6!3m5!1s0x94ce59c8da0aa315:0x1f!8m2');
    expect(link).toEqual({ name: 'Clínica Sorriso', cid: '31' });
  });

  it('builds the campaign link with URL-encoded, comma separated keywords', () => {
    const href = campaignHref(['dentista', 'implante dentário'], 'https://sorriso.com.br/');
    expect(href.startsWith('/dashboard/campaigns?new=1&keywords=')).toBe(true);
    const params = new URL(href, 'http://x').searchParams;
    expect(params.get('new')).toBe('1');
    expect(params.get('keywords')).toBe('dentista,implante dentário');
    expect(params.get('target')).toBe('https://sorriso.com.br/');
    expect(href).not.toContain('+');
  });
});
