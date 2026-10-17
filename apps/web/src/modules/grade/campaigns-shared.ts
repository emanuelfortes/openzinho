// Campaign types and pure helpers, safe to import from client components.
import type { GridQueueMode, GridScheduleFrequency } from '@/lib/db';

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

export function parseCenter(center: string): { lat: number; lng: number } | null {
  const [lat, lng] = center.split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
