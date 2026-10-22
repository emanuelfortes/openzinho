// Campaign types and pure helpers, safe to import from client components.
import type { GridQueueMode, GridScheduleFrequency } from '@/lib/db';
import type { GridDevice } from './grid-config';

export const MAX_CAMPAIGN_KEYWORDS = 20;
export const CAMPAIGN_GRID_SIZES = [3, 5, 7, 9, 11] as const;

export interface GridCampaignInput {
  name: string;
  target: string;
  center: string;
  grid_size: number;
  spacing_km: number;
  language: string;
  queue_mode: Extract<GridQueueMode, 'standard' | 'priority'>;
  frequency: GridScheduleFrequency;
  weekday: number | null;
  month_day: number | null;
  time_of_day: string;
  time_zone: string;
  keywords: string[];
  active: boolean;
  /** Free labels to group clients (neighbourhood, segment, plan…). */
  tags?: string[];
  /** Person in charge of the client at the agency. */
  owner?: string;
  /** Local Finder device; desktop when omitted. */
  device?: GridDevice;
  /** Local results checked per point, 20 to 100; 20 when omitted. */
  depth?: number;
}

export interface GridCampaign extends GridCampaignInput {
  id: string;
  created_at: number;
  updated_at: number;
}

/** Trims, drops blanks and case-insensitive duplicates, keeps the order. */
export function normalizeKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of raw) {
    const keyword = value.trim().replace(/\s+/g, ' ');
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

export const MAX_CAMPAIGN_TAGS = 10;

/** "Aldeota, odonto ,Aldeota" -> ["Aldeota", "odonto"]. */
export function normalizeTags(raw: string | string[] | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : (raw ?? '').split(',');
  return normalizeKeywords(parts.map((part) => part.slice(0, 40))).slice(0, MAX_CAMPAIGN_TAGS);
}

export function parseCenter(center: string): { lat: number; lng: number } | null {
  const [lat, lng] = center.split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export interface CampaignPrefill {
  keywords: string[];
  target: string;
  center: string;
}

/**
 * Values for the new-campaign form from the URL: `keywords=a,b,c` (commas or new lines),
 * `target=...` and `center=lat,lng`. Invalid or missing values come back empty, so the form
 * falls back to its defaults; the form is validated again on save.
 */
export function parseCampaignPrefill(params: { keywords?: string | string[]; target?: string | string[]; center?: string | string[] }): CampaignPrefill {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
  const keywords = normalizeKeywords(first(params.keywords).split(/[,\r\n]+/).map((keyword) => keyword.slice(0, 120)))
    .slice(0, MAX_CAMPAIGN_KEYWORDS);
  const center = parseCenter(first(params.center));
  return {
    keywords,
    target: first(params.target).trim().replace(/\s+/g, ' ').slice(0, 200),
    center: center ? `${center.lat},${center.lng}` : '',
  };
}
