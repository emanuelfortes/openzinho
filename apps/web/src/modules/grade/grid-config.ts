// Local Finder query settings shared by campaigns, monitors and the worker. Pure, safe for client components.

export type GridDevice = 'desktop' | 'mobile';

export const GRID_DEVICES: readonly GridDevice[] = ['desktop', 'mobile'];
export const DEFAULT_GRID_DEVICE: GridDevice = 'desktop';

/** Number of local results checked per grid point. */
export const DEFAULT_GRID_DEPTH = 20;
export const MIN_GRID_DEPTH = 20;
export const MAX_GRID_DEPTH = 100;
export const GRID_DEPTH_OPTIONS = [20, 40, 60, 80, 100] as const;

export const GRID_DEVICE_LABELS: Record<GridDevice, string> = { desktop: 'Desktop', mobile: 'Celular' };

export function normalizeGridDevice(value: unknown): GridDevice {
  return value === 'mobile' ? 'mobile' : DEFAULT_GRID_DEVICE;
}

/** Whole number between 20 and 100; anything unreadable falls back to 20. */
export function normalizeGridDepth(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_GRID_DEPTH;
  return Math.min(Math.max(Math.round(number), MIN_GRID_DEPTH), MAX_GRID_DEPTH);
}

export interface GridQueryConfig {
  device: GridDevice;
  depth: number;
}

export function normalizeGridConfig(input: { device?: unknown; depth?: unknown } | null | undefined): GridQueryConfig {
  return { device: normalizeGridDevice(input?.device), depth: normalizeGridDepth(input?.depth) };
}

/**
 * Suffix for a series fingerprint. Empty for the defaults, so monitors created before device and
 * depth existed (always desktop, 20) keep their series; any other setting is a different monitor.
 */
export function gridConfigKey(input: { device?: unknown; depth?: unknown } | null | undefined): string {
  const { device, depth } = normalizeGridConfig(input);
  return device === DEFAULT_GRID_DEVICE && depth === DEFAULT_GRID_DEPTH ? '' : `${device}|${depth}`;
}

/** "Desktop · 20 resultados", for summaries. */
export function describeGridConfig(input: { device?: unknown; depth?: unknown } | null | undefined): string {
  const { device, depth } = normalizeGridConfig(input);
  return `${GRID_DEVICE_LABELS[device]} · ${depth} resultados`;
}
