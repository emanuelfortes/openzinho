// Monitored profiles: when a refresh is due, how many reviews to ask for, which reviews are new
// and which of them deserve an alert. Pure (no I/O); storage is in monitor-db.ts.
import { parseReviewTimestamp, PRICE_PER_10_REVIEWS } from '@/lib/review-velocity';

export type RefreshFrequency = 'diaria' | 'semanal';

export const FREQUENCIES: Array<{ value: RefreshFrequency; label: string; days: number }> = [
  { value: 'diaria', label: 'Diária', days: 1 },
  { value: 'semanal', label: 'Semanal', days: 7 },
];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The job runs once a day; a little slack keeps a 07:05 run due after a 07:20 run the day before. */
const SLACK_MS = 3 * HOUR_MS;
/** DataForSEO bills reviews in pages of 10; asking for fewer costs the same. */
export const MIN_DEPTH = 10;
export const MAX_REFRESH_DEPTH = 100;
/** Rating at or below which a new review raises an alert. */
export const ALERT_MAX_RATING = 3;

export function parseFrequency(value: unknown): RefreshFrequency {
  return value === 'diaria' ? 'diaria' : 'semanal';
}

export function frequencyDays(frequency: RefreshFrequency): number {
  return FREQUENCIES.find((item) => item.value === frequency)?.days ?? 7;
}

/** First refresh depth: weekly profiles may gather more reviews between two checks. */
export function defaultDepth(frequency: RefreshFrequency): number {
  return frequency === 'diaria' ? 10 : 20;
}

export interface DueInput {
  frequency: RefreshFrequency;
  /** When the last refresh task was posted (null = never). */
  lastPostedAt: number | null;
  /** A task already waiting for its result: never post a second one. */
  pendingTaskId: string | null;
  active: boolean;
}

export function isRefreshDue(input: DueInput, now: number): boolean {
  if (!input.active || input.pendingTaskId) return false;
  if (input.lastPostedAt === null) return true;
  return now - input.lastPostedAt >= frequencyDays(input.frequency) * DAY_MS - SLACK_MS;
}

/**
 * Next depth: when every review fetched was new, some may have been missed, so ask for twice as
 * many next time; when few were new, step back down. Always a multiple of 10.
 */
export function nextDepth(current: number, fetched: number, fresh: number, frequency: RefreshFrequency): number {
  const base = defaultDepth(frequency);
  let depth = current;
  if (fetched > 0 && fresh >= fetched) depth = current * 2;
  else if (fresh <= current / 4) depth = Math.max(base, current / 2);
  return Math.min(MAX_REFRESH_DEPTH, Math.max(MIN_DEPTH, Math.ceil(depth / 10) * 10));
}

/** Advisory cost of one refresh (standard queue, billed per 10 reviews returned at most). */
export function estimateRefreshUsd(depth: number): number {
  return Math.ceil(Math.max(depth, MIN_DEPTH) / 10) * PRICE_PER_10_REVIEWS;
}

/** Advisory monthly cost: refreshes in 30 days times the cost of each. */
export function estimateMonthlyUsd(frequency: RefreshFrequency, depth: number): number {
  return Math.ceil(30 / frequencyDays(frequency)) * estimateRefreshUsd(depth);
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface FetchedReview {
  review_id?: string | null;
  review_url?: string | null;
  rating?: { value?: number } | null;
  timestamp?: string | null;
  profile_name?: string | null;
  review_text?: string | null;
  original_review_text?: string | null;
  owner_answer?: string | null;
}

export interface NormalizedReview {
  key: string;
  rating: number | null;
  author: string;
  publishedAt: number | null;
  text: string;
  url: string | null;
  ownerAnswered: boolean;
}

function hash(text: string): string {
  // FNV-1a, enough to tell reviews without an ID apart.
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, '0');
}

export function cleanReviewText(text: string | null | undefined): string {
  return (text ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeReview(item: FetchedReview): NormalizedReview {
  const text = cleanReviewText(item.review_text ?? item.original_review_text);
  const author = (item.profile_name ?? '').trim();
  const key = item.review_id?.trim() || `h:${hash(`${author}|${item.timestamp ?? ''}|${text.slice(0, 200)}`)}`;
  return {
    key,
    rating: typeof item.rating?.value === 'number' ? item.rating.value : null,
    author: author || 'Anônimo',
    publishedAt: parseReviewTimestamp(item.timestamp ?? null),
    text,
    url: item.review_url?.trim() || null,
    ownerAnswered: Boolean(item.owner_answer && item.owner_answer.trim()),
  };
}

export type AlertStatus = 'nenhum' | 'base' | 'pendente' | 'enviado' | 'visto';

/**
 * Splits a fetch into reviews never seen before and decides each one's alert status. The first
 * fetch of a profile is the baseline: old reviews are recorded but never alerted.
 */
export function classifyFetched(
  fetched: FetchedReview[],
  knownKeys: ReadonlySet<string>,
  baseline: boolean,
): Array<NormalizedReview & { alert: AlertStatus }> {
  const seen = new Set<string>();
  const fresh: Array<NormalizedReview & { alert: AlertStatus }> = [];
  for (const item of fetched) {
    const review = normalizeReview(item);
    if (knownKeys.has(review.key) || seen.has(review.key)) continue;
    seen.add(review.key);
    const low = review.rating !== null && review.rating >= 1 && review.rating <= ALERT_MAX_RATING;
    fresh.push({ ...review, alert: baseline ? 'base' : low ? 'pendente' : 'nenhum' });
  }
  return fresh;
}

export function excerpt(text: string, max = 220): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}
