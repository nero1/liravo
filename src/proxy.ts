import {contentSecurityPolicy} from '@/lib/security-policy';
import { CSRF_COOKIE, CSRF_HEADER, validCsrf, sameOrigin, getRequestOrigin, isStatelessNativeAuth } from '@/lib/csrf';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { isDirectPostgres } from '@/lib/db/provider';
import { LOCALES } from '@/constants/config';
import { getRequestCorrelationId } from '@/lib/utils';

const isDirectPostgresMode = isDirectPostgres();

async function formCsrf(request:NextRequest){
  const reader=request.clone().body?.getReader();if(!reader)return '';
  let timer:ReturnType<typeof setTimeout>|undefined,size=0;const chunks:Uint8Array[]=[];
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Form deadline exceeded')),2000);});
  try{
    for(;;){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;if(size>8192)throw new Error('Form too large');chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return new URLSearchParams(new TextDecoder().decode(bytes)).get('_csrf')??'';
  }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function proxy(request: NextRequest) {
  const correlationId = getRequestCorrelationId(request);
  const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),policy=contentSecurityPolicy(nonce,!isDirectPostgresMode,process.env.NODE_ENV!=='production');
  request.headers.set('x-nonce',nonce);request.headers.set('Content-Security-Policy',policy);
  request.headers.set('x-request-id',correlationId);
  const language = request.nextUrl.searchParams.get('lang');
  const preferred = language ?? request.cookies.get('NEXT_LOCALE')?.value;
  const locale = LOCALES.find(value => value === preferred) ?? 'en';
  request.headers.set('x-liravo-locale', locale);
  request.headers.set('x-liravo-pathname',request.nextUrl.pathname);
  let response = NextResponse.next({ request: { headers: request.headers } });
  const { pathname } = request.nextUrl;
  const origin = getRequestOrigin(request);

  // Bearer handlers authenticate independently and must not fall back to cookies.
  const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ');
  const nativeAuth=isStatelessNativeAuth(request);
  const csrfToken = request.cookies.get(CSRF_COOKIE)?.value ?? crypto.randomUUID();
  const finish = (result = response) => {
    if(result!==response)for(const cookie of response.cookies.getAll())result.cookies.set(cookie);
    result.headers.set('x-request-id',correlationId);result.headers.set('Content-Security-Policy',policy);
    if(!nativeAuth)result.cookies.set(CSRF_COOKIE, csrfToken, { secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    return result;
  };

  // Bugfix: defense-in-depth CSRF guard for mutating API routes using cookie auth.
  if (
    !hasBearerToken
    && !nativeAuth
    && pathname.startsWith('/api/')
    && !pathname.startsWith('/api/webhooks/')
    && !pathname.startsWith('/api/cron/')
    && !['/api/subscriptions/webhook', '/api/tips/webhook'].includes(pathname)
    && pathname!=='/api/users/unsubscribe' // Uses its own limited unsubscribe proof.
    && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
  ) {
    if (!origin) return finish(NextResponse.json({ error: 'Invalid request origin', code: 'ORIGIN_REJECTED', correlationId }, { status: 403 }));
    const cookie = request.cookies.get(CSRF_COOKIE)?.value;
    if (!cookie) return finish(NextResponse.json({ error: 'Invalid CSRF token', code: 'CSRF_REJECTED', correlationId }, { status: 403 }));
    let token = request.headers.get(CSRF_HEADER);
    if (!token && request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
      try { token = await formCsrf(request); }
      catch { return finish(NextResponse.json({ error: 'Invalid form data', code: 'INVALID_FORM', correlationId }, { status: 400 })); }
    }
    if (!validCsrf(cookie, token)) {
      return finish(NextResponse.json({ error: 'Invalid CSRF token', code: 'CSRF_REJECTED', correlationId }, { status: 403 }));
    }
    const requestOrigin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const secFetchSite = request.headers.get('sec-fetch-site');
    const trustedReferer = sameOrigin(referer, origin);
    const trustedFetchSite = secFetchSite === 'same-origin';
    // Bugfix: reject missing-origin mutating requests unless other browser trust headers prove same-site.
    if ((requestOrigin && requestOrigin !== origin) || (!requestOrigin && !trustedReferer && !trustedFetchSite)) {
      return finish(NextResponse.json({ error: 'Invalid request origin', code: 'ORIGIN_REJECTED', correlationId }, { status: 403 }));
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
      cookies:{
        getAll:()=>request.cookies.getAll(),
        setAll(values){
          for(const {name,value}of values)request.cookies.set(name,value);
          const previous=response.cookies.getAll();response=NextResponse.next({request:{headers:request.headers}});
          for(const cookie of previous)response.cookies.set(cookie);
          for(const {name,value,options}of values)response.cookies.set(name,value,options);
        }
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  // Protected routes require authentication
  const protectedPaths = ['/profile', '/shelf', '/discover', '/write'];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    return finish(NextResponse.redirect(new URL('/login', request.url)));
  }

  if (pathname.startsWith('/admin') && !user) {
    return finish(NextResponse.redirect(new URL('/login', request.url)));
  }


  return finish();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|api/cron|api/webhooks).*)',
  ],
};
