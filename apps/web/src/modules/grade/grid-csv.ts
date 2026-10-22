import type { GridPoint } from '@/lib/db';

export const GRID_CSV_COLUMNS = [
  { key: 'linha', label: 'Linha' },
  { key: 'coluna', label: 'Coluna' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'posicao', label: 'Posição' },
  { key: 'primeiro', label: '1º lugar' },
  { key: 'segundo', label: '2º lugar' },
  { key: 'terceiro', label: '3º lugar' },
];

/** One row per grid point, top-left first, with the target's position and the top 3 there. */
export function gridCsvRows(results: GridPoint[]): Record<string, string | number>[] {
  return [...results]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((point) => {
      const top = [...(point.items ?? [])].sort((a, b) => a.rank_group - b.rank_group);
      const name = (index: number) => top[index]?.title ?? '';
      return {
        linha: point.row + 1,
        coluna: point.col + 1,
        latitude: point.lat != null ? point.lat.toFixed(6) : '',
        longitude: point.lng != null ? point.lng.toFixed(6) : '',
        posicao: point.rank != null && point.rank <= 20 ? point.rank : 'Fora do top 20',
        primeiro: name(0),
        segundo: name(1),
        terceiro: name(2),
      };
    });
}

export function gridCsvFilename(keyword: string, searchedAt: number): string {
  const slug = keyword.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grade';
  return `grade-${slug}-${new Date(searchedAt).toISOString().slice(0, 10)}.csv`;
}
