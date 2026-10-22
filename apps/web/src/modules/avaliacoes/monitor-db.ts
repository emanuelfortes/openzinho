// Storage for monitored profiles (per-project SQLite). Tables are created on first use. Every
// function takes an optional explicit project ID for the daily job; without one it uses the
// operation's project scope (see docs/project-scope.md).
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getProjectDataDb } from '@/lib/db';
import {
  defaultDepth, nextDepth, parseFrequency,
  type AlertStatus, type NormalizedReview, type RefreshFrequency,
} from './monitor';

const initialised = new WeakSet<Database.Database>();

function db(projectId?: string): Database.Database {
  const handle = getProjectDataDb(projectId);
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS av_monitored (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        place_id TEXT,
        cid TEXT,
        keyword TEXT,
        location TEXT NOT NULL,
        language TEXT NOT NULL,
        maps_url TEXT,
        frequency TEXT NOT NULL,
        depth INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_posted_at INTEGER,
        last_refresh_at INTEGER,
        pending_task_id TEXT,
        pending_since INTEGER,
        baseline_done INTEGER NOT NULL DEFAULT 0,
        refresh_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS av_reviews (
        monitored_id INTEGER NOT NULL,
        review_key TEXT NOT NULL,
        rating REAL,
        author TEXT NOT NULL,
        published_at INTEGER,
        text TEXT NOT NULL,
        url TEXT,
        owner_answered INTEGER NOT NULL DEFAULT 0,
        first_seen_at INTEGER NOT NULL,
        alert TEXT NOT NULL DEFAULT 'nenhum',
        alerted_at INTEGER,
        PRIMARY KEY (monitored_id, review_key)
      );
      CREATE INDEX IF NOT EXISTS av_reviews_alert ON av_reviews (alert);
    `);
    initialised.add(handle);
  }
  return handle;
}

export interface MonitoredListing {
  id: number;
  listingKey: string;
  title: string;
  placeId: string | null;
  cid: string | null;
  keyword: string | null;
  location: string;
  language: string;
  mapsUrl: string | null;
  frequency: RefreshFrequency;
  depth: number;
  active: boolean;
  createdAt: number;
  lastPostedAt: number | null;
  lastRefreshAt: number | null;
  pendingTaskId: string | null;
  pendingSince: number | null;
  baselineDone: boolean;
  refreshCount: number;
  lastError: string | null;
}

interface Row {
  id: number; listing_key: string; title: string; place_id: string | null; cid: string | null; keyword: string | null;
  location: string; language: string; maps_url: string | null; frequency: string; depth: number; active: number;
  created_at: number; last_posted_at: number | null; last_refresh_at: number | null; pending_task_id: string | null;
  pending_since: number | null; baseline_done: number; refresh_count: number; last_error: string | null;
}

function fromRow(row: Row): MonitoredListing {
  return {
    id: row.id, listingKey: row.listing_key, title: row.title, placeId: row.place_id, cid: row.cid, keyword: row.keyword,
    location: row.location, language: row.language, mapsUrl: row.maps_url, frequency: parseFrequency(row.frequency),
    depth: row.depth, active: row.active === 1, createdAt: row.created_at, lastPostedAt: row.last_posted_at,
    lastRefreshAt: row.last_refresh_at, pendingTaskId: row.pending_task_id, pendingSince: row.pending_since,
    baselineDone: row.baseline_done === 1, refreshCount: row.refresh_count, lastError: row.last_error,
  };
}

/** One profile is one row: the place ID identifies it best, then the CID, then name + location. */
export function listingKey(input: { placeId?: string | null; cid?: string | null; keyword?: string | null; location?: string | null }): string | null {
  if (input.placeId) return `place:${input.placeId}`;
  if (input.cid) return `cid:${input.cid}`;
  const keyword = input.keyword?.trim().toLowerCase();
  return keyword ? `nome:${keyword}|${(input.location ?? '').trim().toLowerCase()}` : null;
}

export interface MonitorInput {
  title: string;
  placeId?: string | null;
  cid?: string | null;
  keyword?: string | null;
  location: string;
  language: string;
  mapsUrl?: string | null;
  frequency: RefreshFrequency;
}

/** Adds a profile, or reactivates it with the new frequency. Returns its ID. */
export function addMonitored(input: MonitorInput, projectId?: string, now = Date.now()): number {
  const key = listingKey(input);
  if (!key) throw new Error('Informe o place ID, o CID ou o nome do perfil.');
  const handle = db(projectId);
  handle.prepare(`
    INSERT INTO av_monitored (listing_key, title, place_id, cid, keyword, location, language, maps_url, frequency, depth, created_at)
    VALUES (@key, @title, @placeId, @cid, @keyword, @location, @language, @mapsUrl, @frequency, @depth, @now)
    ON CONFLICT (listing_key) DO UPDATE SET
      title = excluded.title, frequency = excluded.frequency, active = 1,
      place_id = COALESCE(excluded.place_id, place_id), cid = COALESCE(excluded.cid, cid),
      maps_url = COALESCE(excluded.maps_url, maps_url)
  `).run({
    key, title: input.title.trim() || 'Perfil sem nome', placeId: input.placeId ?? null, cid: input.cid ?? null,
    keyword: input.keyword?.trim() || null, location: input.location, language: input.language, mapsUrl: input.mapsUrl ?? null,
    frequency: input.frequency, depth: defaultDepth(input.frequency), now,
  });
  return (handle.prepare('SELECT id FROM av_monitored WHERE listing_key = ?').get(key) as { id: number }).id;
}

export function listMonitored(projectId?: string): MonitoredListing[] {
  return (db(projectId).prepare('SELECT * FROM av_monitored ORDER BY title COLLATE NOCASE').all() as Row[]).map(fromRow);
}

export function getMonitored(id: number, projectId?: string): MonitoredListing | null {
  const row = db(projectId).prepare('SELECT * FROM av_monitored WHERE id = ?').get(id) as Row | undefined;
  return row ? fromRow(row) : null;
}

export function findMonitoredByKey(key: string, projectId?: string): MonitoredListing | null {
  const row = db(projectId).prepare('SELECT * FROM av_monitored WHERE listing_key = ?').get(key) as Row | undefined;
  return row ? fromRow(row) : null;
}

export function setFrequency(id: number, frequency: RefreshFrequency, projectId?: string): void {
  db(projectId).prepare('UPDATE av_monitored SET frequency = ?, depth = MAX(depth, ?) WHERE id = ?').run(frequency, defaultDepth(frequency), id);
}

export function setActive(id: number, active: boolean, projectId?: string): void {
  db(projectId).prepare('UPDATE av_monitored SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function removeMonitored(id: number, projectId?: string): void {
  const handle = db(projectId);
  handle.transaction(() => {
    handle.prepare('DELETE FROM av_reviews WHERE monitored_id = ?').run(id);
    handle.prepare('DELETE FROM av_monitored WHERE id = ?').run(id);
  })();
}

export function knownReviewKeys(id: number, projectId?: string): Set<string> {
  const rows = db(projectId).prepare('SELECT review_key FROM av_reviews WHERE monitored_id = ?').all(id) as Array<{ review_key: string }>;
  return new Set(rows.map((row) => row.review_key));
}

// ─── Task lifecycle ───────────────────────────────────────────────────────────

const RESERVATION = 'reserva:';

export function isReservation(taskId: string | null): boolean {
  return Boolean(taskId?.startsWith(RESERVATION));
}

/**
 * Claims the profile before posting, so two passes can never post two paid tasks for it.
 * Returns the reservation token, or null when a task is already pending.
 */
export function reserveRefresh(id: number, projectId?: string, now = Date.now()): string | null {
  const token = `${RESERVATION}${randomUUID()}`;
  const result = db(projectId).prepare('UPDATE av_monitored SET pending_task_id = ?, pending_since = ? WHERE id = ? AND pending_task_id IS NULL AND active = 1')
    .run(token, now, id);
  return result.changes === 1 ? token : null;
}

export function confirmRefresh(id: number, token: string, taskId: string, projectId?: string, now = Date.now()): boolean {
  const result = db(projectId).prepare('UPDATE av_monitored SET pending_task_id = ?, pending_since = ?, last_posted_at = ?, last_error = NULL WHERE id = ? AND pending_task_id = ?')
    .run(taskId, now, now, id, token);
  return result.changes === 1;
}

export function releaseReservation(id: number, token: string, error: string | null, projectId?: string): void {
  db(projectId).prepare('UPDATE av_monitored SET pending_task_id = NULL, pending_since = NULL, last_error = ? WHERE id = ? AND pending_task_id = ?')
    .run(error, id, token);
}

/**
 * A reservation left by a pass that died between posting and saving. The task may or may not
 * have been billed; it is released (not retried right away) and the error says so.
 */
export function expireStaleReservations(olderThanMs: number, projectId?: string, now = Date.now()): number {
  return db(projectId).prepare(`UPDATE av_monitored SET pending_task_id = NULL, pending_since = NULL, last_posted_at = ?,
      last_error = 'A última atualização foi interrompida antes de salvar a tarefa. Confira os gastos da DataForSEO.'
    WHERE pending_task_id LIKE '${RESERVATION}%' AND pending_since < ?`).run(now, now - olderThanMs).changes;
}

/** Stores the new reviews of a finished task and frees the profile for its next refresh. */
export function completeRefresh(
  id: number,
  taskId: string,
  fresh: Array<NormalizedReview & { alert: AlertStatus }>,
  fetchedCount: number,
  options: { automatic: boolean },
  projectId?: string,
  now = Date.now(),
): void {
  const handle = db(projectId);
  const listing = getMonitored(id, projectId);
  if (!listing) return;
  const insert = handle.prepare(`INSERT OR IGNORE INTO av_reviews
    (monitored_id, review_key, rating, author, published_at, text, url, owner_answered, first_seen_at, alert)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  handle.transaction(() => {
    for (const review of fresh) {
      insert.run(id, review.key, review.rating, review.author, review.publishedAt, review.text, review.url, review.ownerAnswered ? 1 : 0, now, review.alert);
    }
    const depth = listing.baselineDone ? nextDepth(listing.depth, fetchedCount, fresh.length, listing.frequency) : listing.depth;
    handle.prepare(`UPDATE av_monitored SET pending_task_id = CASE WHEN pending_task_id = ? THEN NULL ELSE pending_task_id END,
        pending_since = CASE WHEN pending_task_id = ? THEN NULL ELSE pending_since END,
        last_refresh_at = ?, baseline_done = 1, depth = ?, refresh_count = refresh_count + ?, last_error = NULL
      WHERE id = ?`).run(taskId, taskId, now, depth, options.automatic ? 1 : 0, id);
  })();
}

export function failRefresh(id: number, taskId: string, message: string, projectId?: string): void {
  db(projectId).prepare('UPDATE av_monitored SET pending_task_id = NULL, pending_since = NULL, last_error = ? WHERE id = ? AND pending_task_id = ?')
    .run(message, id, taskId);
}

/** Uses an already fetched task (e.g. from the Avaliações do Google page) as the baseline, at no cost. */
export function seedBaseline(id: number, fresh: Array<NormalizedReview & { alert: AlertStatus }>, fetchedAt: number, projectId?: string): void {
  const handle = db(projectId);
  const insert = handle.prepare(`INSERT OR IGNORE INTO av_reviews
    (monitored_id, review_key, rating, author, published_at, text, url, owner_answered, first_seen_at, alert)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'base')`);
  handle.transaction(() => {
    for (const review of fresh) insert.run(id, review.key, review.rating, review.author, review.publishedAt, review.text, review.url, review.ownerAnswered ? 1 : 0, fetchedAt);
    handle.prepare(`UPDATE av_monitored SET baseline_done = 1, last_refresh_at = MAX(COALESCE(last_refresh_at, 0), ?),
        last_posted_at = MAX(COALESCE(last_posted_at, 0), ?) WHERE id = ?`).run(fetchedAt, fetchedAt, id);
  })();
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface ReviewAlert {
  monitoredId: number;
  listingTitle: string;
  listingUrl: string | null;
  reviewKey: string;
  rating: number | null;
  author: string;
  publishedAt: number | null;
  text: string;
  url: string | null;
  firstSeenAt: number;
  alert: AlertStatus;
}

export function listAlerts(statuses: AlertStatus[], projectId?: string, limit = 200): ReviewAlert[] {
  if (statuses.length === 0) return [];
  const rows = db(projectId).prepare(`SELECT r.*, m.title AS listing_title, m.maps_url AS listing_url
      FROM av_reviews r JOIN av_monitored m ON m.id = r.monitored_id
      WHERE r.alert IN (${statuses.map(() => '?').join(', ')})
      ORDER BY r.first_seen_at DESC, r.published_at DESC LIMIT ?`).all(...statuses, limit) as Array<{
    monitored_id: number; listing_title: string; listing_url: string | null; review_key: string; rating: number | null; author: string;
    published_at: number | null; text: string; url: string | null; first_seen_at: number; alert: string;
  }>;
  return rows.map((row) => ({
    monitoredId: row.monitored_id, listingTitle: row.listing_title, listingUrl: row.listing_url, reviewKey: row.review_key,
    rating: row.rating, author: row.author, publishedAt: row.published_at, text: row.text, url: row.url,
    firstSeenAt: row.first_seen_at, alert: row.alert as AlertStatus,
  }));
}

/** Moves alerts from "pendente" only, so an alert is e-mailed or dismissed exactly once. */
export function markAlerts(keys: Array<{ monitoredId: number; reviewKey: string }>, status: 'enviado' | 'visto', projectId?: string, now = Date.now()): number {
  const handle = db(projectId);
  const update = handle.prepare(`UPDATE av_reviews SET alert = ?, alerted_at = ? WHERE monitored_id = ? AND review_key = ? AND alert = 'pendente'`);
  let changed = 0;
  handle.transaction(() => {
    for (const key of keys) changed += update.run(status, now, key.monitoredId, key.reviewKey).changes;
  })();
  return changed;
}

export function dismissAllAlerts(projectId?: string, now = Date.now()): number {
  return db(projectId).prepare(`UPDATE av_reviews SET alert = 'visto', alerted_at = ? WHERE alert = 'pendente'`).run(now).changes;
}

export function automaticRefreshCount(projectId?: string): number {
  const row = db(projectId).prepare('SELECT COALESCE(SUM(refresh_count), 0) AS total FROM av_monitored').get() as { total: number };
  return row.total;
}
