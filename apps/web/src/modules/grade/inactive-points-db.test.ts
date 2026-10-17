import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-inactive-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { createProject, runInProjectScope } from '@/lib/db';
import { getInactivePoints, gridGeometryKey, setInactivePoints } from './inactive-points-db';
import { generateGridCoords, postGridTasksQueue } from '@/app/dashboard/local-finder/grid-api';
import { pointKey } from './metrics';

let projectId: string;
const grid = { center: '-3.7319,-38.5267', grid_size: 3, spacing_km: 0.5 };

beforeAll(() => {
  projectId = createProject({
    name: 'Inactive', domain: 'inactive.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100',
  }).id;
});

// SQLite keeps the files open, which Windows refuses to delete; the OS cleans its temp folder.
afterAll(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows file lock */ } });

describe('inactive grid points', () => {
  it('treats differently typed centers as the same grid', () => {
    expect(gridGeometryKey({ ...grid, center: '-3.7319, -38.5267' })).toBe(gridGeometryKey({ ...grid, center: '-3.731900,-38.526700' }));
    expect(gridGeometryKey({ ...grid, grid_size: 5 })).not.toBe(gridGeometryKey(grid));
  });

  it('saves, reads and clears the set', () => runInProjectScope(projectId, () => {
    setInactivePoints(grid, ['0:0', '0:1', '9:9', 'junk']);
    expect([...getInactivePoints({ ...grid, center: '-3.7319, -38.5267' })].sort()).toEqual(['0:0', '0:1']);
    // The cron reads with an explicit project outside any scope.
    expect(getInactivePoints(grid, projectId).size).toBe(2);
    setInactivePoints(grid, []);
    expect(getInactivePoints(grid).size).toBe(0);
  }));

  it('never posts inactive points to DataForSEO', async () => {
    const posted: Array<{ location_coordinate: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Array<{ location_coordinate: string }>;
      posted.push(...body);
      return new Response(JSON.stringify({ tasks: body.map((_, index) => ({ id: `task-${index}`, status_code: 20100, cost: 0.0006 })) }));
    }));
    try {
      const result = await postGridTasksQueue('dentista', grid.center, 3, 0.5, 'Portuguese', 'l', 'p', 'standard', new Set(['0:0', '2:2']));
      expect(posted).toHaveLength(7);
      expect(result.taskPoints.map(pointKey)).not.toContain('0:0');
      expect(result.taskPoints.map(pointKey)).not.toContain('2:2');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps at least one point active', () => runInProjectScope(projectId, () => {
    const all = generateGridCoords(-3.7319, -38.5267, 3, 0.5).map(pointKey);
    expect(() => setInactivePoints(grid, all)).toThrow('Keep at least one point active.');
  }));
});
