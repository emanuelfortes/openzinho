import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-access-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.AUTH_ENABLED = 'true';

import { closeAllDatabases, createProject, getCurrentProject } from './db';
import {
  allowedProjects, canOpenProject, forgetProject, linkUserToProject, resolveProjectForUser, selectProjectForUser,
  unlinkUserFromProject, type AccessUser,
} from './access';

const admin: AccessUser = { id: 'u-admin', email: 'admin@nexo.test', name: 'Admin', role: 'admin' };
const ana: AccessUser = { id: 'u-ana', email: 'ana@clinica.test', name: 'Ana', role: 'cliente' };
const bruno: AccessUser = { id: 'u-bruno', email: 'bruno@padaria.test', name: 'Bruno', role: 'cliente' };
let clinic: string;
let clinic2: string;
let bakery: string;

beforeAll(() => {
  const base = { defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' };
  clinic = createProject({ ...base, name: 'Clínica', domain: 'clinica.test' }).id;
  clinic2 = createProject({ ...base, name: 'Clínica Centro', domain: 'clinica-centro.test' }).id;
  bakery = createProject({ ...base, name: 'Padaria', domain: 'padaria.test' }).id;
  linkUserToProject(ana.id, clinic);
  linkUserToProject(ana.id, clinic2);
  linkUserToProject(bruno.id, bakery);
});

afterAll(() => {
  delete process.env.AUTH_ENABLED;
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('account isolation', () => {
  it('shows a subscriber only the businesses linked to them', () => {
    expect(allowedProjects(ana).map((project) => project.id)).toEqual([clinic, clinic2]);
    expect(allowedProjects(bruno).map((project) => project.id)).toEqual([bakery]);
    expect(canOpenProject(ana, bakery)).toBe(false);
    expect(canOpenProject(bruno, clinic)).toBe(false);
  });

  it('lets admins open every business', () => {
    expect(allowedProjects(admin).length).toBeGreaterThanOrEqual(3);
    expect(canOpenProject(admin, bakery)).toBe(true);
  });

  it('keeps one active business per user, never someone else’s', () => {
    expect(resolveProjectForUser(ana)?.id).toBe(clinic);
    selectProjectForUser(ana, clinic2);
    selectProjectForUser(bruno, bakery);
    expect(resolveProjectForUser(ana)?.id).toBe(clinic2);
    expect(resolveProjectForUser(bruno)?.id).toBe(bakery);
    expect(() => selectProjectForUser(bruno, clinic)).toThrow('Você não tem acesso a este negócio.');
    expect(resolveProjectForUser(bruno)?.id).toBe(bakery);
  });

  it('falls back to another allowed business when one is unlinked or deleted', () => {
    unlinkUserFromProject(ana.id, clinic2);
    expect(resolveProjectForUser(ana)?.id).toBe(clinic);
    forgetProject(bakery);
    expect(resolveProjectForUser(bruno)).toBeNull();
  });

  it('never falls back to a global selection outside a scope', () => {
    expect(() => getCurrentProject()).toThrow('Sem projeto no escopo');
  });
});
