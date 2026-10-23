import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-auth-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-1234567890';

// nextCookies() only matters inside a Next.js request; outside one it has nothing to write to.
vi.mock('next/headers', () => ({ cookies: async () => ({ set: () => {}, get: () => undefined }), headers: async () => new Headers() }));

import { adminApi, closeAuthDatabase, getAuth, listAccounts } from './auth';
import { platformRole } from './access-policy';
import { closeAllDatabases } from './db';

const PASSWORD = 'senha-forte-123';

/** Session cookie of a signed-in account, as the browser would send it. */
async function sessionHeaders(email: string): Promise<Headers> {
  const response = await (await getAuth()).api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0];
  return new Headers({ cookie });
}

afterAll(async () => {
  await closeAuthDatabase();
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('accounts', () => {
  it('makes the first account the platform admin and then closes public sign-up', async () => {
    const auth = await getAuth();
    await auth.api.signUpEmail({ body: { name: 'Dona do Nexo', email: 'admin@nexo.test', password: PASSWORD } });
    await expect(auth.api.signUpEmail({ body: { name: 'Intruso', email: 'x@x.test', password: PASSWORD } })).rejects.toThrow();

    const accounts = await listAccounts();
    expect(accounts).toHaveLength(1);
    expect(platformRole(accounts[0].role)).toBe('admin');
  });

  it('lets an admin create subscribers, who are clients by default', async () => {
    await (await adminApi()).createUser({ body: { name: 'Ana', email: 'Ana@Clinica.test', password: PASSWORD }, headers: await sessionHeaders('admin@nexo.test') });
    const ana = (await listAccounts()).find((account) => account.email === 'ana@clinica.test');
    expect(ana).toBeDefined();
    expect(platformRole(ana!.role)).toBe('cliente');
    expect(ana!.banned).toBe(false);
  });

  it('refuses admin actions from a subscriber session', async () => {
    const admin = (await listAccounts()).find((account) => account.email === 'admin@nexo.test')!;
    await expect((await adminApi()).banUser({ body: { userId: admin.id }, headers: await sessionHeaders('ana@clinica.test') })).rejects.toThrow();
  });

  it('blocks an account with the admin session', async () => {
    const ana = (await listAccounts()).find((account) => account.email === 'ana@clinica.test')!;
    await (await adminApi()).banUser({ body: { userId: ana.id }, headers: await sessionHeaders('admin@nexo.test') });
    expect((await listAccounts()).find((account) => account.id === ana.id)!.banned).toBe(true);
    // A blocked account can no longer sign in.
    await expect((await getAuth()).api.signInEmail({ body: { email: 'ana@clinica.test', password: PASSWORD } })).rejects.toThrow();
  });
});
