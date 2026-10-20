// Nexo monochrome blue rank scale, shared by the Geo-grid map, legends, charts and PDF.

export type RankTier = 'top' | 'mid' | 'low' | 'none';

type Rgb = [number, number, number];

export interface RankTierStyle {
  label: string;
  /** CSS background for pins on the dark UI. */
  fill: string;
  text: string;
  /** CSS border for the pin, empty when the fill is enough. */
  border: string;
  /** CSS box-shadow glow, empty for no glow. */
  glow: string;
  /** Opaque swatch for legends and charts (no transparency to blend). */
  swatch: string;
  /** Opaque colours for the PDF, printed on a white page. */
  pdfFill: Rgb;
  pdfText: Rgb;
}

export const RANK_TIERS: Record<RankTier, RankTierStyle> = {
  top: {
    label: '#1-3', fill: '#c2e0ff', text: '#030508', border: '', glow: '0 0 18px rgba(194,224,255,.6)',
    swatch: '#c2e0ff', pdfFill: [194, 224, 255], pdfText: [3, 5, 8],
  },
  mid: {
    label: '#4-10', fill: '#4da2ff', text: '#ffffff', border: '', glow: '',
    swatch: '#4da2ff', pdfFill: [77, 162, 255], pdfText: [255, 255, 255],
  },
  low: {
    label: '#11-20', fill: '#1246b8', text: '#ffffff', border: '', glow: '',
    swatch: '#1246b8', pdfFill: [18, 70, 184], pdfText: [255, 255, 255],
  },
  none: {
    label: '20+ / não encontrado', fill: 'rgba(77,162,255,.1)', text: 'rgba(194,224,255,.45)', border: '1px solid rgba(77,162,255,.4)', glow: '',
    swatch: '#16263d', pdfFill: [226, 237, 252], pdfText: [90, 120, 160],
  },
};

export const RANK_TIER_ORDER: RankTier[] = ['top', 'mid', 'low', 'none'];

export function rankTier(rank: number | null | undefined): RankTier {
  if (rank == null || !Number.isFinite(rank) || rank < 1 || rank > 20) return 'none';
  if (rank <= 3) return 'top';
  if (rank <= 10) return 'mid';
  return 'low';
}

export function rankStyle(rank: number | null | undefined): RankTierStyle {
  return RANK_TIERS[rankTier(rank)];
}
