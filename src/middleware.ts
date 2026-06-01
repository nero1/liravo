import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { getDoUserFromRequest } from '@/lib/db/unified-client';
import { isDirectPostgres } from '@/lib/db/provider';

const isDirectPostgresMode = isDirectPostgres();

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const { pathname, origin } = request.nextUrl;

  // Mobile clients (React Native) send a Bearer token instead of cookies.
  // Bearer token presence proves identity — skip CSRF for these requests.
  const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ');

  // Bugfix: defense-in-depth CSRF guard for mutating API routes using cookie auth.
  if (
    !hasBearerToken
    && pathname.startsWith('/api/')
    && !pathname.startsWith('/api/webhooks/')
    && !pathname.startsWith('/api/cron/')
    && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  ) {
    const requestOrigin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const secFetchSite = request.headers.get('sec-fetch-site');
    const trustedReferer = referer?.startsWith(origin) ?? false;
    const trustedFetchSite = secFetchSite === 'same-origin' || secFetchSite === 'same-site';
    // Bugfix: reject missing-origin mutating requests unless other browser trust headers prove same-site.
    if ((requestOrigin && requestOrigin !== origin) || (!requestOrigin && !trustedReferer && !trustedFetchSite)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }
  }

  // ── DigitalOcean mode ────────────────────────────────────────────────────────
  if (isDirectPostgresMode) {
    const user = await getDoUserFromRequest((name) => request.cookies.get(name)?.value);

    const protectedPaths = ['/profile', '/shelf', '/discover', '/write'];
    const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

    if (isProtected && !user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (pathname.startsWith('/admin') && !user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (pathname === '/login' && user) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return response;
  }

  // ── Supabase mode ────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip auth checks entirely when Supabase is not configured
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient<Database, 'public'>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  // Protected routes require authentication
  const protectedPaths = ['/profile', '/shelf', '/discover', '/write'];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname.startsWith('/admin') && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from auth pages
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|api/cron|api/webhooks).*)',
  ],
};
