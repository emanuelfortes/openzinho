// Which parts of the dashboard a subscriber (business owner) can open. Everything else,
// including the advanced SEO tools, global settings and other clients, is for platform admins.
// Pure and Edge-safe: used by the middleware, the sidebar and the dashboard home.

export type PlatformRole = 'admin' | 'cliente';

/** Better Auth's admin plugin stores roles as a comma-separated string ("admin", "user", "admin,user"). */
export function platformRole(role: string | null | undefined): PlatformRole {
  return (role ?? '').split(',').map((part) => part.trim()).includes('admin') ? 'admin' : 'cliente';
}

/** Pages a business owner uses to improve their own business. */
export const CLIENT_PAGE_PREFIXES = [
  '/dashboard/geo-grid',
  '/dashboard/campaigns',
  '/dashboard/grid-points',
  '/dashboard/clientes',
  '/dashboard/local-finder',
  '/dashboard/google-reviews',
  '/dashboard/monitor-de-avaliacoes',
  '/dashboard/pedido-de-avaliacao',
  '/dashboard/review-velocity',
  '/dashboard/sugestao-de-palavras',
  '/dashboard/studio',
  '/dashboard/conta',
];

/** API routes behind those pages. */
export const CLIENT_API_PREFIXES = [
  '/api/active-project',
  '/api/grid-check',
  '/api/grid-tasks',
  '/api/business-search',
  '/api/locations',
];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** True when a subscriber may open this path. Paths outside /dashboard and /api are not restricted here. */
export function clientCanAccess(pathname: string): boolean {
  if (pathname === '/dashboard') return true;
  if (pathname.startsWith('/dashboard')) return CLIENT_PAGE_PREFIXES.some((prefix) => matches(pathname, prefix));
  if (pathname.startsWith('/api/')) return CLIENT_API_PREFIXES.some((prefix) => matches(pathname, prefix));
  return true;
}

export function canAccess(role: PlatformRole, pathname: string): boolean {
  return role === 'admin' || clientCanAccess(pathname);
}
