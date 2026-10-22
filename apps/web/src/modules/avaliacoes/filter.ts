// Review list filters: rating, answered or not, period and text. Pure, safe for any component.

export interface FilterableReview {
  rating?: { value?: number };
  review_text?: string;
  profile_name?: string;
  owner_answer?: string;
  timestamp?: string;
}

export type RatingFilter = '' | 'positivas' | 'negativas' | '1' | '2' | '3' | '4' | '5';
export type AnswerFilter = '' | 'respondidas' | 'sem-resposta';
export type PeriodFilter = '' | '30' | '90' | '365';

export interface ReviewFilters {
  nota: RatingFilter;
  resposta: AnswerFilter;
  periodo: PeriodFilter;
  q: string;
}

const RATINGS: RatingFilter[] = ['positivas', 'negativas', '1', '2', '3', '4', '5'];
const ANSWERS: AnswerFilter[] = ['respondidas', 'sem-resposta'];
const PERIODS: PeriodFilter[] = ['30', '90', '365'];

/** Reads the filters from URL search params, ignoring unknown values. */
export function parseReviewFilters(params: Record<string, string | string[] | undefined>): ReviewFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value ?? '').trim();
  };
  const pick = <T extends string>(value: string, allowed: T[]): T | '' => (allowed.includes(value as T) ? (value as T) : '');
  return {
    nota: pick(one('nota'), RATINGS),
    resposta: pick(one('resposta'), ANSWERS),
    periodo: pick(one('periodo'), PERIODS),
    q: one('q').slice(0, 100),
  };
}

export function hasActiveFilters(filters: ReviewFilters): boolean {
  return Boolean(filters.nota || filters.resposta || filters.periodo || filters.q);
}

/** Lowercase without accents, so "otimo" finds "Ótimo". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterReviews<T extends FilterableReview>(reviews: T[], filters: ReviewFilters, now = Date.now()): T[] {
  const query = fold(filters.q);
  const since = filters.periodo ? now - Number(filters.periodo) * 86_400_000 : null;
  return reviews.filter((review) => {
    const rating = review.rating?.value ?? 0;
    if (filters.nota === 'positivas' && rating < 4) return false;
    if (filters.nota === 'negativas' && (rating < 1 || rating > 3)) return false;
    if (/^[1-5]$/.test(filters.nota) && Math.round(rating) !== Number(filters.nota)) return false;
    if (filters.resposta === 'respondidas' && !review.owner_answer) return false;
    if (filters.resposta === 'sem-resposta' && review.owner_answer) return false;
    if (since !== null) {
      const time = review.timestamp ? Date.parse(review.timestamp) : NaN;
      if (!Number.isFinite(time) || time < since) return false;
    }
    if (query) {
      const haystack = fold(`${review.review_text ?? ''} ${review.profile_name ?? ''} ${review.owner_answer ?? ''}`);
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
