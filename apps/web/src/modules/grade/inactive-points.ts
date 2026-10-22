// Pure helpers for inactive grid points, safe for client components.

export interface GridGeometry {
  center: string;
  grid_size: number;
  spacing_km: number;
}

/** Same grid regardless of how the center was typed ("-3.73, -38.52" vs "-3.730000,-38.520000"). */
export function gridGeometryKey(grid: GridGeometry): string | null {
  const [lat, lng] = grid.center.split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat.toFixed(6)},${lng.toFixed(6)}|${grid.grid_size}|${Number(grid.spacing_km.toFixed(4))}`;
}

/** Link to the point selector for a grid, returning to `back` afterwards. */
export function gridPointsHref(grid: GridGeometry, back: string): string {
  const params = new URLSearchParams({
    center: grid.center, grid_size: String(grid.grid_size), spacing_km: String(grid.spacing_km), back,
  });
  return `/dashboard/grid-points?${params.toString()}`;
}
