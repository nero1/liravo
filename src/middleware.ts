import { CSRF_COOKIE, CSRF_HEADER, validCsrf, sameOrigin } from '@/lib/csrf';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { isDirectPostgres } from '@/lib/db/provider';
import { LOCALES } from '@/constants/config';

const isDirectPostgresMode = isDirectPostgres();

export async function middleware(request: NextRequest) {
  const language = request.nextUrl.searchParams.get('lang');
  const preferred = language ?? request.cookies.get('NEXT_LOCALE')?.value;
  const locale = LOCALES.find(value => value === preferred) ?? 'en';
  request.headers.set('x-liravo-locale', locale);
  let response = NextResponse.next({ request: { headers: request.headers } });
  const { pathname, origin } = request.nextUrl;

  // Bearer handlers authenticate independently and must not fall back to cookies.
  const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ');
  const csrfToken = request.cookies.get(CSRF_COOKIE)?.value ?? crypto.randomUUID();
  const finish = () => {
    response.cookies.set(CSRF_COOKIE, csrfToken, { secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    return response;
  };

  // Bugfix: defense-in-depth CSRF guard for mutating API routes using cookie auth.
  if (
    !hasBearerToken
    && pathname.startsWith('/api/')
    && !pathname.startsWith('/api/webhooks/')
    && !pathname.startsWith('/api/cron/')
    && !['/api/subscriptions/webhook', '/api/tips/webhook'].includes(pathname)
    && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  ) {
    const cookie = request.cookies.get(CSRF_COOKIE)?.value;
    if (!cookie) return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    let token = request.headers.get(CSRF_HEADER);
    if (!token && request.headers.get('content-type')?.includes('form')) {
      try { token = String((await request.clone().formData()).get('_csrf') ?? ''); }
      catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }
    }
    if (!validCsrf(cookie, token)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    const requestOrigin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const secFetchSite = request.headers.get('sec-fetch-site');
    const trustedReferer = sameOrigin(referer, origin);
    const trustedFetchSite = secFetchSite === 'same-origin';
    // Bugfix: reject missing-origin mutating requests unless other browser trust headers prove same-site.
    if ((requestOrigin && requestOrigin !== origin) || (!requestOrigin && !trustedReferer && !trustedFetchSite)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }
  }

  if (isDirectPostgresMode) return finish();

  // ── Supabase mode ────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip auth checks entirely when Supabase is not configured
  if (!supabaseUrl || !supabaseAnonKey) {
    return finish();
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

  return finish();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|api/cron|api/webhooks).*)',
  ],
};
