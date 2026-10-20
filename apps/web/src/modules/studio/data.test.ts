import { describe, expect, it } from 'vitest';
import { competitorPressure, scanCost, scoreTier, simulateGrid, studioGrid, studioMetrics } from './data';

describe('studioGrid', () => {
  it('loads the saved 17 x 17 proof with every paid coordinate', () => {
    const grid = studioGrid('proof17', 9, 'square');
    expect(grid.size).toBe(17);
    expect(grid.points).toHaveLength(289);
  });

  it('matches the recorded metrics of the 17 x 17 proof', () => {
    const metrics = studioMetrics(studioGrid('proof17', 17, 'square').points);
    expect(metrics.notFound).toBe(64);
    expect(metrics.top3Share).toBeCloseTo(34.6, 1);
    expect(metrics.averageFound).toBeCloseTo(4.97, 2);
  });

  it('loads the 5 x 5 proof', () => {
    expect(studioGrid('proof5', 17, 'square').points).toHaveLength(25);
  });
});

describe('simulateGrid', () => {
  it('is deterministic and keeps the center at rank 3', () => {
    const a = simulateGrid(9, 'square');
    expect(simulateGrid(9, 'square')).toEqual(a);
    expect(a.points.find((point) => point.row === 4 && point.col === 4)?.rank).toBe(3);
  });

  it('drops the corners for a circle', () => {
    expect(simulateGrid(9, 'circle').points.length).toBeLessThan(81);
  });
});

describe('studio numbers', () => {
  it('prices a 17 x 17 standard scan like the proof receipt', () => {
    expect(scanCost(289, 'standard')).toBeCloseTo(0.1734, 4);
  });

  it('ranks competitors by top-three appearances', () => {
    const pressure = competitorPressure([
      { id: 'a', row: 0, col: 0, lat: 0, lng: 0, rank: 1, topResult: 'X', topThree: ['X', 'Y'] },
      { id: 'b', row: 0, col: 1, lat: 0, lng: 0, rank: null, topResult: 'Y', topThree: ['Y', 'Z'] },
    ]);
    expect(pressure[0]).toEqual(['Y', 2]);
  });

  it('bands keyword scores', () => {
    expect([null, 9.9, 12.2, 16.7].map(scoreTier)).toEqual(['none', 'good', 'mid', 'low']);
  });
});
