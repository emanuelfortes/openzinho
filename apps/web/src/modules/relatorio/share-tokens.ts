// Read-only share links for a campaign report (/r/<token>).
// Only the SHA-256 of each token is stored, in the campaign's own project database; the full token
// is shown once when created. A public request is resolved by hashing it and looking it up in each
// project (a handful of indexed lookups), so the URL never carries a project or campaign ID.
import type Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { getProjectDataDb, getProjects } from '@/lib/db';

/** 32 random bytes in base64url: 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** `manual`: created in the panel. `email`: rotated by the monthly e-mail job. */
export type ShareTokenKind = 'manual' | 'email';

export interface ShareTokenInfo {
  id: string;
  kind: ShareTokenKind;
  created_at: number;
  last_used_at: number | null;
}

const initialised = new WeakSet<Database.Database>();

function db(projectId?: string): Database.Database {
  const handle = getProjectDataDb(projectId);
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS relatorio_share_tokens (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS relatorio_share_tokens_campaign ON relatorio_share_tokens (campaign_id);
    `);
    initialised.add(handle);
  }
  return handle;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Creates a new link and revokes earlier links of the same kind for this campaign, so each
 * campaign has at most one panel link and one e-mail link. Returns the token; it cannot be read back later.
 */
export function createShareToken(campaignId: string, kind: ShareTokenKind = 'manual', projectId?: string): string {
  const token = generateToken();
  const handle = db(projectId);
  handle.transaction(() => {
    handle.prepare('DELETE FROM relatorio_share_tokens WHERE campaign_id = ? AND kind = ?').run(campaignId, kind);
    handle.prepare('INSERT INTO relatorio_share_tokens (id, campaign_id, token_hash, kind, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), campaignId, hashToken(token), kind, Date.now());
  })();
  return token;
}

/** Revokes one link (by its row ID) or, without an ID, every link of the campaign. */
export function revokeShareTokens(campaignId: string, id?: string, projectId?: string): number {
  const handle = db(projectId);
  return id
    ? handle.prepare('DELETE FROM relatorio_share_tokens WHERE campaign_id = ? AND id = ?').run(campaignId, id).changes
    : handle.prepare('DELETE FROM relatorio_share_tokens WHERE campaign_id = ?').run(campaignId).changes;
}

export function revokeShareTokensOfKind(campaignId: string, kind: ShareTokenKind, projectId?: string): number {
  return db(projectId).prepare('DELETE FROM relatorio_share_tokens WHERE campaign_id = ? AND kind = ?').run(campaignId, kind).changes;
}

export function listShareTokens(campaignId: string, projectId?: string): ShareTokenInfo[] {
  return db(projectId)
    .prepare('SELECT id, kind, created_at, last_used_at FROM relatorio_share_tokens WHERE campaign_id = ? ORDER BY created_at DESC')
    .all(campaignId) as ShareTokenInfo[];
}

/** Project and campaign of a valid token, or null. Malformed tokens never touch the database. */
export function resolveShareToken(token: string): { projectId: string; campaignId: string } | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  const hash = hashToken(token);
  for (const project of getProjects()) {
    const handle = db(project.id);
    const row = handle.prepare('SELECT id, campaign_id FROM relatorio_share_tokens WHERE token_hash = ?').get(hash) as { id: string; campaign_id: string } | undefined;
    if (row) {
      handle.prepare('UPDATE relatorio_share_tokens SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
      return { projectId: project.id, campaignId: row.campaign_id };
    }
  }
  return null;
}

/** NEXO_PUBLIC_URL without a trailing slash, or null when missing or not http(s). */
export function publicBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.NEXO_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function sharePath(token: string, month?: string): string {
  return `/r/${token}${month ? `?mes=${month}` : ''}`;
}
