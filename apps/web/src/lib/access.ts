// Accounts and isolation. With login on, every request belongs to a signed-in user: an admin
// (platform team) opens every business, a subscriber only the businesses linked to their account.
// Each user keeps their own active business; there is no global selection shared between people.
// Without login (local single-operator installs) the old global selection still applies.
import type Database from 'better-sqlite3';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authEnabled } from './auth-config';
import { platformRole, type PlatformRole } from './access-policy';
import { getActiveProject, getControlDataDb, getProjects, runInProjectScope, setActiveProject, type Project } from './db';

export interface AccessUser {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
}

/** Stand-in user when login is off: the single local operator, who can do everything. */
export const LOCAL_OPERATOR: AccessUser = { id: 'local', email: '', name: 'Operador local', role: 'admin' };

const initialised = new WeakSet<Database.Database>();

function db(): Database.Database {
  const handle = getControlDataDb();
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS project_members (
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, project_id)
      );
      CREATE INDEX IF NOT EXISTS project_members_project ON project_members (project_id);
      CREATE TABLE IF NOT EXISTS user_active_project (
        user_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL
      );
    `);
    initialised.add(handle);
  }
  return handle;
}

/** The signed-in user of this request, or null. Blocked (banned) accounts have no session. */
export async function requestUser(): Promise<AccessUser | null> {
  if (!authEnabled()) return LOCAL_OPERATOR;
  const { getSession } = await import('./auth');
  const session = await getSession(await headers());
  if (!session) return null;
  const user = session.user as { id: string; email: string; name: string; role?: string | null };
  return { id: user.id, email: user.email, name: user.name, role: platformRole(user.role) };
}

export async function requireUser(): Promise<AccessUser> {
  const user = await requestUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<AccessUser> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('Apenas administradores do Nexo podem fazer isto.');
  return user;
}

export function projectIdsOfUser(userId: string): string[] {
  return (db().prepare('SELECT project_id FROM project_members WHERE user_id = ? ORDER BY created_at').all(userId) as Array<{ project_id: string }>)
    .map((row) => row.project_id);
}

/** Businesses this user may open: all of them for admins, the linked ones for subscribers. */
export function allowedProjects(user: AccessUser): Project[] {
  const projects = getProjects();
  if (user.role === 'admin') return projects;
  const linked = new Set(projectIdsOfUser(user.id));
  return projects.filter((project) => linked.has(project.id));
}

export function canOpenProject(user: AccessUser, projectId: string): boolean {
  return allowedProjects(user).some((project) => project.id === projectId);
}

/** The user's active business: their saved choice when still allowed, else their first one. */
export function resolveProjectForUser(user: AccessUser): Project | null {
  if (!authEnabled()) return getActiveProject();
  const allowed = allowedProjects(user);
  if (allowed.length === 0) return null;
  const saved = (db().prepare('SELECT project_id FROM user_active_project WHERE user_id = ?').get(user.id) as { project_id: string } | undefined)?.project_id;
  return allowed.find((project) => project.id === saved) ?? allowed[0];
}

export function selectProjectForUser(user: AccessUser, projectId: string): void {
  if (!authEnabled()) {
    setActiveProject(projectId);
    return;
  }
  if (!canOpenProject(user, projectId)) throw new Error('Você não tem acesso a este negócio.');
  db().prepare(`INSERT INTO user_active_project (user_id, project_id) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET project_id = excluded.project_id`).run(user.id, projectId);
}

/** Used by withProjectScope and runWithCurrentProject when login is on. */
export async function requestProjectId(): Promise<string> {
  const user = await requireUser();
  const project = resolveProjectForUser(user);
  if (!project) redirect('/sem-acesso');
  return project.id;
}

/** For route handlers: runs `operation` inside this user's active business (pages use withProjectScope). */
export async function inRequestProject<T>(operation: () => T | Promise<T>): Promise<T> {
  const projectId = authEnabled() ? await requestProjectId() : getActiveProject().id;
  return runInProjectScope(projectId, operation);
}

export function linkUserToProject(userId: string, projectId: string): void {
  db().prepare('INSERT OR IGNORE INTO project_members (user_id, project_id, created_at) VALUES (?, ?, ?)').run(userId, projectId, Date.now());
}

export function unlinkUserFromProject(userId: string, projectId: string): void {
  db().prepare('DELETE FROM project_members WHERE user_id = ? AND project_id = ?').run(userId, projectId);
  db().prepare('DELETE FROM user_active_project WHERE user_id = ? AND project_id = ?').run(userId, projectId);
}

/** Removes every link to a deleted business. */
export function forgetProject(projectId: string): void {
  db().prepare('DELETE FROM project_members WHERE project_id = ?').run(projectId);
  db().prepare('DELETE FROM user_active_project WHERE project_id = ?').run(projectId);
}

/** Removes every link of a deleted user. */
export function forgetUser(userId: string): void {
  db().prepare('DELETE FROM project_members WHERE user_id = ?').run(userId);
  db().prepare('DELETE FROM user_active_project WHERE user_id = ?').run(userId);
}

/** project id -> user ids, for the admin screens. */
export function membersByProject(): Map<string, string[]> {
  const rows = db().prepare('SELECT user_id, project_id FROM project_members ORDER BY created_at').all() as Array<{ user_id: string; project_id: string }>;
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.project_id, [...(map.get(row.project_id) ?? []), row.user_id]);
  return map;
}
