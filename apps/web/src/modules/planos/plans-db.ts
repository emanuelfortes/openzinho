// The subscription of each business: plan and status, kept in the control store.
// A business without a row has no subscription yet; subscribers on it get the Básico limits.
import type Database from 'better-sqlite3';
import { getControlDataDb } from '@/lib/db';
import { DEFAULT_PLAN, PLANS, type PlanDefinition, type PlanId, type PlanStatus } from './plans';

export * from './plans';

export interface BusinessSubscription {
  projectId: string;
  plan: PlanId;
  status: PlanStatus;
  /** Free note for the team (contract, discount…). */
  note: string;
  updatedAt: number;
}

const initialised = new WeakSet<Database.Database>();

function db(): Database.Database {
  const handle = getControlDataDb();
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS project_plans (
        project_id TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
    `);
    initialised.add(handle);
  }
  return handle;
}

type Row = { project_id: string; plan: string; status: string; note: string; updated_at: number };

function fromRow(row: Row): BusinessSubscription {
  return {
    projectId: row.project_id,
    plan: (row.plan in PLANS ? row.plan : DEFAULT_PLAN) as PlanId,
    status: (['ativo', 'teste', 'suspenso'].includes(row.status) ? row.status : 'ativo') as PlanStatus,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export function getSubscription(projectId: string): BusinessSubscription | null {
  const row = db().prepare('SELECT * FROM project_plans WHERE project_id = ?').get(projectId) as Row | undefined;
  return row ? fromRow(row) : null;
}

export function listSubscriptions(): Map<string, BusinessSubscription> {
  return new Map((db().prepare('SELECT * FROM project_plans').all() as Row[]).map((row) => [row.project_id, fromRow(row)]));
}

export function saveSubscription(projectId: string, plan: PlanId, status: PlanStatus, note = ''): void {
  db().prepare(`INSERT INTO project_plans (project_id, plan, status, note, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET plan = excluded.plan, status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`)
    .run(projectId, plan, status, note.trim().slice(0, 200), Date.now());
}

export function deleteSubscription(projectId: string): void {
  db().prepare('DELETE FROM project_plans WHERE project_id = ?').run(projectId);
}

/** Limits a subscriber gets on this business. */
export function planOf(projectId: string): PlanDefinition {
  return PLANS[getSubscription(projectId)?.plan ?? DEFAULT_PLAN];
}

export function isSuspended(projectId: string): boolean {
  return getSubscription(projectId)?.status === 'suspenso';
}
