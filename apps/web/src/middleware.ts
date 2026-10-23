import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled } from '@/lib/auth-config';
import { canAccess, platformRole, type PlatformRole } from '@/lib/access-policy';

// Reachable without a session. /api/cron has its own bearer secret (used by the worker container).
// /r/<token> is a read-only campaign report shared by secret link (modules/relatorio/share-tokens).
// /api/webhooks receives payment notifications (Mercado Pago), which re-read the state from the provider.
const PUBLIC_PREFIXES = ['/login', '/setup', '/api/auth', '/api/cron', '/api/webhooks', '/r'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The Edge runtime cannot open the SQLite file, so the session is validated by asking the
 * auth handler of this same server. Sessions that were revoked (sign-out, expiry) are rejected immediately.
 */
async function sessionRole(request: NextRequest): Promise<PlatformRole | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie || !cookie.includes('session_token')) return null;
  const port = process.env.PORT?.trim() || request.nextUrl.port || '3000';
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/get-session`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json() as { session?: unknown; user?: { role?: string | null } } | null;
    return data?.session ? platformRole(data.user?.role) : null;
  } catch {
    return null; // Fail closed.
  }
}

export async function middleware(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  const role = await sessionRole(request);
  if (role) {
    // Subscribers only reach their own pages; admin areas and advanced tools answer 403 or go home.
    if (canAccess(role, pathname)) return NextResponse.next();
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const home = request.nextUrl.clone();
    home.pathname = '/dashboard';
    home.search = '';
    return NextResponse.redirect(home);
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' || pathname === '/dashboard' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
