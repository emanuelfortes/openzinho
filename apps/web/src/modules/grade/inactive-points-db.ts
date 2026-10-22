// Grid points switched off by the user (sea, river, park). Keyed by the grid geometry, so every
// keyword scanned on the same grid shares one set. Inactive points are never posted to DataForSEO.
import type Database from 'better-sqlite3';
import { getProjectDataDb } from '@/lib/db';
import { gridGeometryKey, type GridGeometry } from './inactive-points';

export * from './inactive-points';

const initialised = new WeakSet<Database.Database>();

function db(projectId?: string): Database.Database {
  const handle = getProjectDataDb(projectId);
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS grade_inactive_points (
        grid_key TEXT PRIMARY KEY,
        center TEXT NOT NULL,
        grid_size INTEGER NOT NULL,
        spacing_km REAL NOT NULL,
        points TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    initialised.add(handle);
  }
  return handle;
}

/** Inactive `row:col` keys for this grid. Pass a project ID outside a request scope (cron). */
export function getInactivePoints(grid: GridGeometry, projectId?: string): Set<string> {
  const key = gridGeometryKey(grid);
  if (!key) return new Set();
  const row = db(projectId).prepare('SELECT points FROM grade_inactive_points WHERE grid_key = ?').get(key) as { points: string } | undefined;
  if (!row) return new Set();
  try {
    return new Set(JSON.parse(row.points) as string[]);
  } catch {
    return new Set();
  }
}

/** Replaces the inactive set. Keys outside the grid are dropped and at least one point stays active. */
export function setInactivePoints(grid: GridGeometry, keys: Iterable<string>): Set<string> {
  const key = gridGeometryKey(grid);
  if (!key) throw new Error('Centro da grade inválido.');
  const valid = new Set<string>();
  for (const value of keys) {
    const match = /^(\d+):(\d+)$/.exec(value);
    if (match && Number(match[1]) < grid.grid_size && Number(match[2]) < grid.grid_size) valid.add(value);
  }
  if (valid.size >= grid.grid_size * grid.grid_size) throw new Error('Mantenha pelo menos um ponto ativo.');

  const handle = db();
  if (valid.size === 0) {
    handle.prepare('DELETE FROM grade_inactive_points WHERE grid_key = ?').run(key);
  } else {
    handle.prepare(`INSERT INTO grade_inactive_points (grid_key, center, grid_size, spacing_km, points, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(grid_key) DO UPDATE SET points = excluded.points, updated_at = excluded.updated_at`)
      .run(key, grid.center, grid.grid_size, grid.spacing_km, JSON.stringify([...valid].sort()), Date.now());
  }
  return valid;
}
