// Owner reply metrics and the estimated time saved. Pure, safe for any component.
import { parseReviewTimestamp } from '@/lib/review-velocity';

export interface ReplyMetricReview {
  rating?: { value?: number } | null;
  timestamp?: string | null;
  owner_answer?: string | null;
  owner_timestamp?: string | null;
}

/** Assumptions behind the time estimates. Shown on screen next to the numbers. */
export const MINUTES_PER_REPLY = 4;
export const MINUTES_PER_MANUAL_CHECK = 5;

export interface ReplyMetrics {
  total: number;
  answered: number;
  /** 0-100, null without reviews. */
  replyRate: number | null;
  negatives: number;
  negativesAnswered: number;
  negativeReplyRate: number | null;
  unansweredNegatives: number;
  /** Median hours between review and reply, over replies with both dates. Null when none. */
  medianReplyHours: number | null;
  /** Replies that carry a date (the median's sample). */
  timedReplies: number;
  /** Estimated minutes to answer every review still without a reply. */
  backlogMinutes: number;
}

const hasAnswer = (review: ReplyMetricReview) => Boolean(review.owner_answer && review.owner_answer.trim());
const isNegative = (review: ReplyMetricReview) => {
  const rating = review.rating?.value ?? 0;
  return rating >= 1 && rating <= 3;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function replyMetrics(reviews: ReplyMetricReview[], minutesPerReply = MINUTES_PER_REPLY): ReplyMetrics {
  const answered = reviews.filter(hasAnswer);
  const negatives = reviews.filter(isNegative);
  const negativesAnswered = negatives.filter(hasAnswer).length;
  const delays: number[] = [];
  for (const review of answered) {
    const posted = parseReviewTimestamp(review.timestamp);
    const replied = parseReviewTimestamp(review.owner_timestamp);
    if (posted !== null && replied !== null && replied >= posted) delays.push((replied - posted) / 3_600_000);
  }
  const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
  return {
    total: reviews.length,
    answered: answered.length,
    replyRate: rate(answered.length, reviews.length),
    negatives: negatives.length,
    negativesAnswered,
    negativeReplyRate: rate(negativesAnswered, negatives.length),
    unansweredNegatives: negatives.length - negativesAnswered,
    medianReplyHours: median(delays),
    timedReplies: delays.length,
    backlogMinutes: (reviews.length - answered.length) * minutesPerReply,
  };
}

/**
 * Time the automatic refresh saves: each automatic check replaces opening the profile and reading
 * the new reviews by hand. An estimate, not a measurement.
 */
export function timeSavedMinutes(automaticChecks: number, minutesPerCheck = MINUTES_PER_MANUAL_CHECK): number {
  return Math.max(0, Math.round(automaticChecks)) * minutesPerCheck;
}

/** "45 min", "3 h 20 min", "2 dias e 4 h". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} dias e ${restHours} h` : `${days} dias`;
}

export function formatReplyDelay(hours: number | null): string {
  if (hours === null) return '—';
  return formatDuration(hours * 60);
}
