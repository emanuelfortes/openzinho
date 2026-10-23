import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-plans-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.AUTH_ENABLED = 'true';

import { closeAllDatabases, createProject } from '@/lib/db';
import { subscriberLockedOut, type AccessUser } from '@/lib/access';
import { getClientCapBrl, saveClientCapBrl } from '@/modules/custos/budget';
import { deleteSubscription, getSubscription, isSuspended, listSubscriptions, planOf, saveSubscription } from './plans-db';

let clinic: string;
let bakery: string;
const client: AccessUser = { id: 'u1', email: 'a@a.test', name: 'A', role: 'cliente' };
const admin: AccessUser = { id: 'u0', email: 'x@nexo.test', name: 'X', role: 'admin' };

beforeAll(() => {
  const base = { defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' };
  clinic = createProject({ ...base, name: 'Clínica', domain: 'clinica.test' }).id;
  bakery = createProject({ ...base, name: 'Padaria', domain: 'padaria.test' }).id;
});

afterAll(() => {
  delete process.env.AUTH_ENABLED;
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('subscriptions', () => {
  it('gives a business without a plan the Básico limits and no cap', () => {
    expect(getSubscription(clinic)).toBeNull();
    expect(planOf(clinic).id).toBe('basico');
    expect(getClientCapBrl(clinic)).toBeNull();
  });

  it('stores the plan and status of each business', () => {
    saveSubscription(clinic, 'completo', 'ativo', ' contrato anual ');
    saveSubscription(bakery, 'intermediario', 'teste');
    expect(getSubscription(clinic)).toMatchObject({ plan: 'completo', status: 'ativo', note: 'contrato anual' });
    expect(planOf(bakery).maxGridSize).toBe(7);
    expect(listSubscriptions().size).toBe(2);
  });

  it('uses the plan cap until one is set by hand', () => {
    expect(getClientCapBrl(clinic)).toBe(40);
    saveClientCapBrl(clinic, 100);
    expect(getClientCapBrl(clinic)).toBe(100);
    saveClientCapBrl(clinic, null);
    expect(getClientCapBrl(clinic)).toBe(40);
  });

  it('locks a subscriber out of a suspended business, never an admin', () => {
    expect(subscriberLockedOut(client, clinic)).toBe(false);
    saveSubscription(clinic, 'completo', 'suspenso');
    expect(isSuspended(clinic)).toBe(true);
    expect(subscriberLockedOut(client, clinic)).toBe(true);
    expect(subscriberLockedOut(admin, clinic)).toBe(false);
  });

  it('removes a subscription', () => {
    deleteSubscription(bakery);
    expect(getSubscription(bakery)).toBeNull();
  });
});
