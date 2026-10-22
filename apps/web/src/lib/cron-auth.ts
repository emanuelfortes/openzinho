// Shared check for the worker's internal endpoints (same secret as /api/cron/geo-grid).
import { readFileSync } from 'fs';
import type { NextRequest } from 'next/server';

export function getCronSecret(): string | null {
  if (process.env.CRON_SECRET?.trim()) return process.env.CRON_SECRET.trim();
  if (!process.env.CRON_SECRET_FILE) return null;
  try {
    return readFileSync(process.env.CRON_SECRET_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function isCronAuthorized(request: NextRequest): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-cron-secret');
  return token === secret;
}
