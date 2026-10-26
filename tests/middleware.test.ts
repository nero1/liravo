import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

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
