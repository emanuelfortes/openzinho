// Studio data: the saved DataForSEO proof scans, the modeled demo and the numbers shown around them.
// Pure functions only, so the page and the tests share the same maths.
import proof17 from './data/home-slice-17.json';
import proof5 from './data/home-slice-5.json';
import { PRICE_PER_POINT_USD } from '@/modules/grade/estimate';

export type StudioDataset = 'proof17' | 'proof5' | 'simulation';
export type StudioQueue = 'standard' | 'priority' | 'live';
export type StudioShape = 'square' | 'circle';

export interface StudioPoint {
  id: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
  /** null when the business is not in the top 20 at this point. */
  rank: number | null;
  topResult: string;
  topThree: string[];
}

export interface StudioGrid {
  size: number;
  points: StudioPoint[];
  center: { lat: number; lng: number };
  title: string;
  source: string;
}

interface SavedRun {
  keyword: string;
  target: string;
  location: string;
  points: Array<{ id: string; row: number; col: number; lat: number; lng: number; rank: number | null; top: string[]; match: string | null }>;
}

export const STUDIO_TARGET = (proof17 as SavedRun).target;
export const STUDIO_KEYWORD = (proof17 as SavedRun).keyword;
export const STUDIO_LOCATION = (proof17 as SavedRun).location;

const AUSTIN_CENTER = { lat: 30.249711, lng: -97.749132 };

/** Per-point DataForSEO price. Live is the Google Maps live endpoint, not offered for scheduled grids. */
export const QUEUE_RATES: Record<StudioQueue, number> = {
  standard: PRICE_PER_POINT_USD.standard,
  priority: PRICE_PER_POINT_USD.priority,
  live: 0.002,
};

export const QUEUE_LABELS: Record<StudioQueue, string> = { standard: 'Padrão', priority: 'Prioritária', live: 'Ao vivo' };

export const SIMULATION_SIZES = [5, 7, 9, 11, 13, 15, 17] as const;

function gridFromRun(run: SavedRun, size: number, title: string, source: string): StudioGrid {
  return {
    size,
    center: AUSTIN_CENTER,
    title,
    source,
    points: run.points.map((point) => ({
      id: point.id,
      row: point.row,
      col: point.col,
      lat: point.lat,
      lng: point.lng,
      rank: point.rank,
      topResult: point.match ?? point.top[0] ?? 'Não encontrado',
      topThree: point.top,
    })),
  };
}

function coordinateForCell(row: number, col: number, size: number, center: { lat: number; lng: number }, radiusKm = 2) {
  const centerIndex = (size - 1) / 2;
  const stepKm = size === 1 ? 0 : (2 * radiusKm) / (size - 1);
  const northKm = (centerIndex - row) * stepKm;
  const eastKm = (col - centerIndex) * stepKm;
  return {
    lat: center.lat + northKm / 110.574,
    lng: center.lng + eastKm / (111.32 * Math.cos((center.lat * Math.PI) / 180)),
  };
}

function noise(row: number, col: number, salt = 0) {
  const value = Math.sin((row + 1) * 12.9898 + (col + 1) * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function gaussian(dx: number, dy: number, width: number) {
  return Math.exp(-((dx * dx + dy * dy) / width));
}

/** Deterministic modeled grid: same layout on every render, no API spend. */
export function simulateGrid(size: number, shape: StudioShape): StudioGrid {
  const center = Math.floor(size / 2);
  const points: StudioPoint[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const dx = col - center;
      const dy = row - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (shape === 'circle' && distance > center + 0.35) continue;
      const organicDistance = Math.sqrt(((dx + 0.7) * 0.92) ** 2 + ((dy - 0.4) * 1.08) ** 2);
      const corridor = Math.exp(-((dy - dx * 0.34 - 1.25) ** 2) / 7) * 3.3;
      const westPocket = gaussian(dx + 4.1, dy - 1.4, 10) * 2.6;
      const southPocket = gaussian(dx - 0.8, dy - 4.6, 12) * 2.1;
      const eastRiver = Math.exp(-((dx - 5.1) ** 2) / 5) * Math.exp(-((dy + 0.3) ** 2) / 22) * 4.0;
      const northeast = gaussian(dx - 3.6, dy + 4.2, 11) * 4.2;
      const southwestGap = gaussian(dx + 5.4, dy - 5.2, 11) * 3.5;
      const micro = (noise(row, col) - 0.5) * 3.8 + Math.sin(row * 0.82 + col * 0.31) * 1.1 + Math.cos(col * 1.17 - row * 0.43) * 0.9;
      const rank = Math.max(1, Math.min(24, Math.round(organicDistance * 2.05 + 4.2 - corridor - westPocket - southPocket + eastRiver + northeast + southwestGap + micro)));
      const missing = rank > 19 || (distance > center * 0.86 && noise(row, col, 2) > 0.28);
      points.push({
        id: `r${row}c${col}`,
        row,
        col,
        ...coordinateForCell(row, col, size, AUSTIN_CENTER),
        rank: missing ? null : rank,
        topResult: missing ? 'Show Me Pizza' : rank <= 4 ? STUDIO_TARGET : 'Via 313 Pizza',
        topThree: rank <= 4 ? [STUDIO_TARGET, 'Show Me Pizza', 'Via 313 Pizza'] : ['Show Me Pizza', 'Via 313 Pizza', 'DeSano Downtown'],
      });
    }
  }
  const middle = points.find((point) => point.row === center && point.col === center);
  if (middle) {
    middle.rank = 3;
    middle.topResult = STUDIO_TARGET;
  }
  return { size, points, center: AUSTIN_CENTER, title: `Modelado ${size} x ${size}`, source: 'Posições sintéticas para testar o layout. Sem gasto de API.' };
}

export function studioGrid(dataset: StudioDataset, size: number, shape: StudioShape): StudioGrid {
  if (dataset === 'proof5') {
    return gridFromRun(proof5 as SavedRun, 5, 'Prova real DataForSEO 5 x 5', 'Recibo DataForSEO salvo · 25 resultados pagos de coordenada.');
  }
  if (dataset === 'simulation') return simulateGrid(size, shape);
  return gridFromRun(proof17 as SavedRun, 17, 'Prova real DataForSEO 17 x 17', 'Recibo DataForSEO salvo da fila padrão · 289 resultados pagos de coordenada.');
}

export interface StudioMetrics {
  top3Share: number;
  top10Share: number;
  /** Mean rank over the points where the business was found. */
  averageFound: number | null;
  notFound: number;
}

export function studioMetrics(points: StudioPoint[]): StudioMetrics {
  const ranks = points.map((point) => point.rank).filter((rank): rank is number => rank !== null);
  const share = (count: number) => (points.length ? (count / points.length) * 100 : 0);
  return {
    top3Share: share(ranks.filter((rank) => rank <= 3).length),
    top10Share: share(ranks.filter((rank) => rank <= 10).length),
    averageFound: ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null,
    notFound: points.length - ranks.length,
  };
}

/** Businesses that appear most often in the top three, across every point. */
export function competitorPressure(points: StudioPoint[], limit = 6): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const point of points) {
    for (const name of point.topThree) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function scanCost(pointCount: number, queue: StudioQueue): number {
  return pointCount * QUEUE_RATES[queue];
}

export function formatUsd(value: number, digits = 2): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export interface ModeledKeywordScan {
  keyword: string;
  /** Average position over the grid, 21 counted for points outside the top 20; null when never found. */
  avgScore: number | null;
}

/** Modeled campaign, to show one package with several keywords. Not a real scan. */
export const MODELED_CAMPAIGN = {
  business: 'Reformas Exemplo Ltda.',
  place: 'Campinas, SP · demo modelada',
  settings: 'Círculo · 39 pts · cerca de 15 minutos · única',
  keywords: [
    { keyword: 'reforma residencial', avgScore: null },
    { keyword: 'telhados', avgScore: null },
    { keyword: 'edícula', avgScore: 20.4 },
    { keyword: 'reforma de banheiro', avgScore: 16.7 },
    { keyword: 'reforma de cozinha', avgScore: 16.1 },
    { keyword: 'empreiteira', avgScore: 12.2 },
    { keyword: 'reformas', avgScore: 10.4 },
    { keyword: 'empreiteiro de reformas', avgScore: 9.9 },
  ] satisfies ModeledKeywordScan[],
};

export function scoreTier(score: number | null): 'good' | 'mid' | 'low' | 'none' {
  if (score === null) return 'none';
  if (score <= 10) return 'good';
  if (score <= 15) return 'mid';
  return 'low';
}
