import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

afterEach(()=>vi.unstubAllEnvs());

it('propagates one validated request ID to the handler and browser response',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');
  const response=await middleware(new NextRequest('https://app.test/login',{headers:{'x-request-id':'request-integration-123'}}));
  expect(response.headers.get('x-request-id')).toBe('request-integration-123');
  expect(response.headers.get('x-middleware-request-x-request-id')).toBe('request-integration-123');
  const generated=await middleware(new NextRequest('https://app.test/login',{headers:{'x-request-id':'bad id'}}));
  expect(generated.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
});

it('includes the same correlation and a stable code on CSRF rejection',async()=>{
  const response=await middleware(new NextRequest('https://app.test/api/tips/create',{method:'POST',headers:{'x-request-id':'request-csrf-123'}}));
  expect(response.status).toBe(403);
  expect(response.headers.get('x-request-id')).toBe('request-csrf-123');
  expect(await response.json()).toMatchObject({code:'CSRF_REJECTED',correlationId:'request-csrf-123'});
});

it('accepts the public HTTP authority when Next constructs an internal request URL',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');
  const token=crypto.randomUUID();
  const request=new NextRequest('http://localhost:3001/api/tips/create',{method:'POST',headers:{host:'127.0.0.1:3001',origin:'http://127.0.0.1:3001',cookie:`${CSRF_COOKIE}=${token}`,[CSRF_HEADER]:token}});
  expect((await middleware(request)).status).toBe(200);
});

it('rejects cross-origin and forwarded-host spoofing even with a well-formed token',async()=>{
  const token=crypto.randomUUID();
  for(const host of ['app.test','user@app.test','app.test/path']) {
    const request=new NextRequest('https://internal.test/api/tips/create',{method:'POST',headers:{host,origin:'https://attacker.test','x-forwarded-host':'attacker.test',cookie:`${CSRF_COOKIE}=${token}`,[CSRF_HEADER]:token}});
    expect((await middleware(request)).status).toBe(403);
  }
});
