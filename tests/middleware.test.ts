import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

const session=vi.hoisted(()=>({refresh:vi.fn()}));
type CookieAdapter={set:(name:string,value:string,options:Record<string,unknown>)=>void;remove:(name:string,options:Record<string,unknown>)=>void};
vi.mock('@supabase/ssr',()=>({createServerClient:(_url:string,_key:string,options:{cookies:CookieAdapter})=>({auth:{getUser:async()=>{session.refresh(options.cookies);return {data:{user:null}};}}})}));

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

it('retains every refreshed and deleted cookie on normal and redirect responses',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','fixture');
 session.refresh.mockImplementation((cookies:CookieAdapter)=>{cookies.set('sb-token.0','first',{path:'/'});cookies.set('sb-token.1','second',{path:'/'});cookies.remove('sb-token.2',{path:'/',maxAge:0});});
 for(const path of['/book/fixture','/shelf']){const result=await middleware(new NextRequest('https://app.test'+path));expect(result.cookies.get('sb-token.0')?.value).toBe('first');expect(result.cookies.get('sb-token.1')?.value).toBe('second');expect(result.cookies.get('sb-token.2')?.maxAge).toBe(0);}
 session.refresh.mockReset();
});

it('requires the CSRF header for multipart without consuming the upload and bounds ordinary form tokens',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');const token=crypto.randomUUID();
 let consumed=0;const body=new ReadableStream({pull(controller){if(consumed===4){controller.close();return;}consumed++;controller.enqueue(new Uint8Array(1024*1024));}});
 const request=new NextRequest('https://app.test/api/users/avatar',{method:'POST',headers:{origin:'https://app.test',cookie:`${CSRF_COOKIE}=${token}`,'Content-Type':'multipart/form-data; boundary=fixture'},body,duplex:'half'}as ConstructorParameters<typeof NextRequest>[1]);
 expect((await middleware(request)).status).toBe(403);expect(consumed).toBeLessThanOrEqual(1);await request.body?.cancel();
 for(const [form,status]of[['_csrf='+token,200],['_csrf='+token+'&junk='+'x'.repeat(9000),400]]as const){const result=await middleware(new NextRequest('https://app.test/api/users/profile',{method:'POST',headers:{origin:'https://app.test',cookie:`${CSRF_COOKIE}=${token}`,'Content-Type':'application/x-www-form-urlencoded'},body:form}));expect(result.status).toBe(status);}
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

it('allows public one-click unsubscribe proofs through while retaining CSRF on ambient account mutations',async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');
  const unsubscribe=await middleware(new NextRequest('https://app.test/api/users/unsubscribe?token='+'a'.repeat(64),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}));expect(unsubscribe.status).toBe(200);
  const protectedResponse=await middleware(new NextRequest('https://app.test/api/users/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'}));expect(protectedResponse.status).toBe(403);
});
