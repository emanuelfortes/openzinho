// Saved keyword suggestion researches, one table per project database. `ts` and `cost` follow
// the convention read by the Spending page (SPEND_SOURCES in lib/db.ts).
import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'crypto';
import { getProjectDataDb } from '@/lib/db';
import { fold } from './normalize';
import type { ResearchInput, ResearchResult } from './types';

export const PALAVRAS_TABLE = 'palavras_pesquisas';

const initialised = new WeakSet<Database.Database>();

function db(): Database.Database {
  const handle = getProjectDataDb();
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS ${PALAVRAS_TABLE} (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        business TEXT NOT NULL,
        website TEXT NOT NULL,
        location TEXT NOT NULL,
        language TEXT NOT NULL,
        theme_count INTEGER NOT NULL,
        scope TEXT NOT NULL,
        cost REAL,
        result TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_palavras_pesquisas_ts ON ${PALAVRAS_TABLE}(ts);
      CREATE INDEX IF NOT EXISTS idx_palavras_pesquisas_fp ON ${PALAVRAS_TABLE}(fingerprint);
    `);
    initialised.add(handle);
  }
  return handle;
}

export interface PesquisaResumo {
  id: string;
  ts: number;
  business: string;
  website: string;
  location: string;
  themeCount: number;
  scope: string;
  cost: number | null;
}

/** Same inputs, same research: used to offer reopening instead of paying again. */
export function researchFingerprint(input: ResearchInput): string {
  const parts = [input.cid ?? '', fold(input.business), input.website.trim().toLowerCase().replace(/\/+$/, ''), fold(input.location), input.language, input.mapsProbe ? '1' : '0'];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

export function savePesquisa(result: ResearchResult, now = Date.now()): string {
  const id = randomUUID();
  const label = result.gbp?.title || result.input.business || result.input.website || 'Pesquisa';
  db().prepare(`INSERT INTO ${PALAVRAS_TABLE} (id, ts, fingerprint, business, website, location, language, theme_count, scope, cost, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, now, researchFingerprint(result.input), label, result.website?.url ?? result.input.website, result.input.location, result.input.language,
    result.selection.selected.length, result.selection.scope,
    // Unknown cost (no task reported one) stays NULL so the Spending page can estimate it.
    result.sources.some((s) => s.costUsd !== null && s.costUsd > 0) ? result.totalCostUsd : (result.sources.some((s) => s.costUsd === null && s.status !== 'pulado') ? null : 0),
    JSON.stringify(result),
  );
  return id;
}

type SummaryRow = { id: string; ts: number; business: string; website: string; location: string; theme_count: number; scope: string; cost: number | null };
const SUMMARY = 'id, ts, business, website, location, theme_count, scope, cost';
const summary = (r: SummaryRow): PesquisaResumo => ({ id: r.id, ts: r.ts, business: r.business, website: r.website, location: r.location, themeCount: r.theme_count, scope: r.scope, cost: r.cost });

export function listPesquisas(limit = 30): PesquisaResumo[] {
  const rows = db().prepare(`SELECT ${SUMMARY} FROM ${PALAVRAS_TABLE} WHERE hidden = 0 ORDER BY ts DESC LIMIT ?`).all(limit) as SummaryRow[];
  return rows.map(summary);
}

export function getPesquisa(id: string): (ResearchResult & { id: string; ts: number }) | null {
  const row = db().prepare(`SELECT id, ts, result FROM ${PALAVRAS_TABLE} WHERE id = ? AND hidden = 0`).get(id) as { id: string; ts: number; result: string } | undefined;
  if (!row) return null;
  try {
    return { ...(JSON.parse(row.result) as ResearchResult), id: row.id, ts: row.ts };
  } catch {
    return null;
  }
}

export function findRecentPesquisa(input: ResearchInput, maxAgeMs = 30 * 86_400_000, now = Date.now()): PesquisaResumo | null {
  const row = db().prepare(`SELECT ${SUMMARY} FROM ${PALAVRAS_TABLE} WHERE fingerprint = ? AND ts >= ? AND hidden = 0 ORDER BY ts DESC LIMIT 1`)
    .get(researchFingerprint(input), now - maxAgeMs) as SummaryRow | undefined;
  return row ? summary(row) : null;
}

/** Hides it from the list; the row stays so its cost keeps counting on the Spending page and caps. */
export function hidePesquisa(id: string): void {
  db().prepare(`UPDATE ${PALAVRAS_TABLE} SET hidden = 1 WHERE id = ?`).run(id);
}
