import { describe, expect, it } from 'vitest';
import type { GridPoint } from '@/lib/db';
import { gridCsvFilename, gridCsvRows } from './grid-csv';

const item = (rank: number, title: string, target = false) => ({ rank_group: rank, title, is_target: target });

describe('gridCsvRows', () => {
  it('lists points top-left first with position and top 3', () => {
    const results: GridPoint[] = [
      { row: 1, col: 0, lat: -3.7, lng: -38.5, rank: null, items: [item(2, 'B'), item(1, 'A')] },
      { row: 0, col: 1, lat: -3.69, lng: -38.49, rank: 2, items: [item(1, 'A'), item(2, 'Cliente', true), item(3, 'C')] },
    ];
    expect(gridCsvRows(results)).toEqual([
      { linha: 1, coluna: 2, latitude: '-3.690000', longitude: '-38.490000', posicao: 2, primeiro: 'A', segundo: 'Cliente', terceiro: 'C' },
      { linha: 2, coluna: 1, latitude: '-3.700000', longitude: '-38.500000', posicao: 'Fora do top 20', primeiro: 'A', segundo: 'B', terceiro: '' },
    ]);
  });

  it('builds an accent-free file name with the date', () => {
    expect(gridCsvFilename('Implante dentário', Date.parse('2026-10-22T10:00:00Z'))).toBe('grade-implante-dentario-2026-10-22.csv');
  });
});
