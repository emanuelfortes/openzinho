import { describe, expect, it } from 'vitest';
import { filterReviews, hasActiveFilters, parseReviewFilters, type ReviewFilters } from './filter';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const reviews = [
  { id: 'a', rating: { value: 5 }, review_text: 'Ótimo atendimento', owner_answer: 'Obrigado!', timestamp: daysAgo(3) },
  { id: 'b', rating: { value: 4 }, review_text: 'Bom, mas demorado', timestamp: daysAgo(40) },
  { id: 'c', rating: { value: 2 }, review_text: 'Fila enorme', profile_name: 'Maria', timestamp: daysAgo(200) },
  { id: 'd', rating: { value: 1 }, review_text: 'Péssimo', owner_answer: 'Sentimos muito', timestamp: daysAgo(400) },
  { id: 'e', rating: { value: 3 } },
];

const none: ReviewFilters = { nota: '', resposta: '', periodo: '', q: '' };
const ids = (filters: Partial<ReviewFilters>) => filterReviews(reviews, { ...none, ...filters }, NOW).map((review) => review.id);

describe('filterReviews', () => {
  it('splits positive (4-5) and negative (1-3) reviews', () => {
    expect(ids({ nota: 'positivas' })).toEqual(['a', 'b']);
    expect(ids({ nota: 'negativas' })).toEqual(['c', 'd', 'e']);
    expect(ids({ nota: '2' })).toEqual(['c']);
  });

  it('filters by owner answer', () => {
    expect(ids({ resposta: 'respondidas' })).toEqual(['a', 'd']);
    expect(ids({ resposta: 'sem-resposta' })).toEqual(['b', 'c', 'e']);
  });

  it('filters by period, leaving out reviews without a date', () => {
    expect(ids({ periodo: '30' })).toEqual(['a']);
    expect(ids({ periodo: '365' })).toEqual(['a', 'b', 'c']);
  });

  it('searches text, author and answer, ignoring accents and case', () => {
    expect(ids({ q: 'otimo' })).toEqual(['a']);
    expect(ids({ q: 'maria' })).toEqual(['c']);
    expect(ids({ q: 'SENTIMOS' })).toEqual(['d']);
  });

  it('combines filters', () => {
    expect(ids({ nota: 'negativas', resposta: 'sem-resposta', periodo: '365' })).toEqual(['c']);
  });

  it('keeps everything without filters', () => {
    expect(ids({})).toHaveLength(5);
  });
});

describe('parseReviewFilters', () => {
  it('ignores unknown values', () => {
    expect(parseReviewFilters({ nota: 'otimas', resposta: 'talvez', periodo: '7', q: '  fila  ' }))
      .toEqual({ nota: '', resposta: '', periodo: '', q: 'fila' });
  });

  it('reads valid values and reports active filters', () => {
    const filters = parseReviewFilters({ nota: 'negativas', resposta: 'sem-resposta', periodo: '90' });
    expect(filters).toEqual({ nota: 'negativas', resposta: 'sem-resposta', periodo: '90', q: '' });
    expect(hasActiveFilters(filters)).toBe(true);
    expect(hasActiveFilters(parseReviewFilters({}))).toBe(false);
  });
});
