import Database from 'better-sqlite3';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { randomBytes } from 'crypto';
import fs from 'fs';
import { authDbPath } from './db';

const MIN_PASSWORD_LENGTH = 10;

function resolveSecret(dbPath: string): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // No secret configured: generate one once and keep it next to the auth database.
  const file = `${dbPath}-secret`;
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // Not created yet.
  }
  const secret = randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function authOptions(db: Database.Database, secret: string) {
  return {
    database: db,
    secret,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          // The first account is created from /setup and becomes the platform admin. After that,
          // public sign-up is closed: only an admin creates accounts (POST /admin/create-user).
          before: async (user, context) => {
            if (!db.prepare('SELECT 1 FROM "user" LIMIT 1').get()) return { data: { ...user, role: 'admin' } };
            if (context?.path === '/admin/create-user') return;
            throw new APIError('FORBIDDEN', { message: 'O cadastro está fechado.' });
          },
        },
      },
    },
    advanced: {
      // Secure cookies are dropped by browsers on plain http (a LAN address, say), which would make
      // login impossible. Set BETTER_AUTH_URL to the public https URL to turn them on.
      useSecureCookies: process.env.BETTER_AUTH_URL?.trim().toLowerCase().startsWith('https://') ?? false,
    },
    // Roles: "admin" runs the platform, "user" is a subscriber (business owner). See lib/access-policy.ts.
    plugins: [nextCookies(), admin({ defaultRole: 'user', adminRoles: ['admin'], bannedUserMessage: 'Esta conta está bloqueada. Fale com o suporte do Nexo.' })],
  } satisfies BetterAuthOptions;
}

type AuthBundle = { auth: ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>; db: Database.Database };

// Route handlers and server components can be bundled separately; keep one instance per process.
const globalForAuth = globalThis as typeof globalThis & { __seoPlaygroundAuth?: Promise<AuthBundle> };

async function createBundle(): Promise<AuthBundle> {
  const dbPath = authDbPath();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const options = authOptions(db, resolveSecret(dbPath));
  // Create the tables first: Better Auth checks the schema as soon as it is instantiated.
  await (await getMigrations(options)).runMigrations();
  // Installs from before roles existed have a single account with the default role: it is the owner.
  if (!db.prepare(`SELECT 1 FROM "user" WHERE role LIKE '%admin%' LIMIT 1`).get()) {
    db.prepare(`UPDATE "user" SET role = 'admin' WHERE id = (SELECT id FROM "user" ORDER BY createdAt ASC LIMIT 1)`).run();
  }
  return { auth: betterAuth(options), db };
}

function bundle(): Promise<AuthBundle> {
  if (!globalForAuth.__seoPlaygroundAuth) {
    const created = createBundle();
    // A failed start must be retried on the next request, not cached forever.
    created.catch(() => { globalForAuth.__seoPlaygroundAuth = undefined; });
    globalForAuth.__seoPlaygroundAuth = created;
  }
  return globalForAuth.__seoPlaygroundAuth;
}

export async function getAuth() {
  return (await bundle()).auth;
}

export async function getSession(headers: Headers) {
  return (await getAuth()).api.getSession({ headers });
}

export interface Account {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: number;
}

/** Every login account, oldest first (admin screens only). */
export async function listAccounts(): Promise<Account[]> {
  const b = await bundle();
  const rows = b.db.prepare('SELECT id, name, email, role, banned, createdAt FROM "user" ORDER BY createdAt ASC').all() as Array<{
    id: string; name: string; email: string; role: string | null; banned: number | null; createdAt: string | number;
  }>;
  return rows.map((row) => ({
    id: row.id, name: row.name, email: row.email, role: row.role ?? 'user', banned: Boolean(row.banned),
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : Date.parse(row.createdAt),
  }));
}

/**
 * Admin-plugin endpoints. Pass the signed-in admin's request headers: Better Auth checks the
 * session and the admin role itself (createUser also accepts a headerless trusted call).
 * Callers check requireAdmin() first as well.
 */
export async function adminApi() {
  return (await getAuth()).api;
}

/** Tests only: closes the login database so its temporary folder can be removed. */
export async function closeAuthDatabase(): Promise<void> {
  const pending = globalForAuth.__seoPlaygroundAuth;
  globalForAuth.__seoPlaygroundAuth = undefined;
  if (pending) (await pending).db.close();
}

export { MIN_PASSWORD_LENGTH };

/** False on a fresh install, which is when /setup is offered. */
export async function hasUsers(): Promise<boolean> {
  const b = await bundle();
  return Boolean(b.db.prepare('SELECT 1 FROM "user" LIMIT 1').get());
}
