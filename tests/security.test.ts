import { describe, it, expect, vi, afterEach } from 'vitest';
import { validCsrf, sameOrigin } from '../src/lib/csrf';
import { HttpError, isTransientError, withExponentialBackoff } from '../src/lib/retry';
import { getClientIp } from '../src/lib/utils';
import { safeModelText } from '../src/lib/ai-safety';

vi.mock('@/lib/locks', () => ({ withRedisLock: vi.fn() }));
import { withRedisLock } from '../src/lib/locks';
import { cron } from '../src/lib/cron';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('security controls', () => {
  it('requires an exact, well formed double-submit token', () => {
    const token = crypto.randomUUID();
    expect(validCsrf(token, token)).toBe(true);
    expect(validCsrf(undefined, token)).toBe(false);
    expect(validCsrf(token, crypto.randomUUID())).toBe(false);
    expect(validCsrf('x', 'x')).toBe(false);
  });
  it('does not mistake programmer errors or error message digits for transient failures', () => {
    for (const error of [new TypeError('undefined'), new Error('invalid input 5'), new HttpError(401),new HttpError(400)]) expect(isTransientError(error)).toBe(false);
    for (const error of [new HttpError(429),new HttpError(503),{cause:{code:'ECONNRESET'}}]) expect(isTransientError(error)).toBe(true);
  });
  it('bounds retries and never retries permanent failures', async () => {
    const transient = vi.fn().mockRejectedValue(new HttpError(503));
    await expect(withExponentialBackoff(transient,{retries:2,baseDelayMs:0})).rejects.toThrow('503');
    expect(transient).toHaveBeenCalledTimes(3);
    const permanent = vi.fn().mockRejectedValue(new HttpError(403));
    await expect(withExponentialBackoff(permanent)).rejects.toThrow('403');
    expect(permanent).toHaveBeenCalledTimes(1);
  });
  it('ignores untrusted forwarding headers', () => {
    vi.stubEnv('VERCEL',''); vi.stubEnv('TRUSTED_CLIENT_IP_HEADER','');
    expect(getClientIp(new Request('https://app.test',{headers:{'x-real-ip':'1.2.3.4','x-forwarded-for':'5.6.7.8'}}))).toBe('unknown');
  });
  it('rejects unsafe or malformed model output', () => {
    expect(safeModelText('<script>alert(1)</script>')).toBe(false);
    expect(safeModelText({text:'hello'})).toBe(false);
    expect(safeModelText('')).toBe(false);
    expect(safeModelText('Try a shorter sentence.')).toBe(true);
  });
  it('fails closed when cron credentials are absent or wrong', async () => {
    vi.stubEnv('CRON_SECRET','');
    const task=vi.fn(); const run=cron('test',task);
    expect((await run(new Request('https://app.test'))).status).toBe(401);
    vi.stubEnv('CRON_SECRET','secret');
    expect((await run(new Request('https://app.test',{headers:{'x-cron-secret':'secret'}}))).status).toBe(401);
    expect(task).not.toHaveBeenCalled();
    expect(withRedisLock).not.toHaveBeenCalled();
  });
  it('reports overlap and Redis failure without executing duplicate work', async () => {
    vi.stubEnv('CRON_SECRET','secret');
    const request=new Request('https://app.test',{headers:{authorization:'Bearer secret'}});
    vi.mocked(withRedisLock).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Redis down'));
    const run=cron('test',vi.fn());
    expect((await run(request)).status).toBe(409);
    expect((await run(request)).status).toBe(503);
  });
});

vi.mock('@/lib/auth/getCurrentUser', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
import { getCurrentUser } from '../src/lib/auth/getCurrentUser';
import { createClient } from '../src/lib/supabase/server';
import { PUT as updateGoal } from '../src/app/api/users/[id]/reading-goal/route';

describe('reading goal ownership', () => {
  const actor='00000000-0000-4000-8000-000000000001';
  it('rejects unauthenticated updates', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await updateGoal(new Request('https://app.test'),{params:{id:actor}})).status).toBe(401);
  });
  it('denies cross-user mutations before touching the database', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'reader@example.test'});
    const from=vi.fn(); vi.mocked(createClient).mockReturnValue({from} as unknown as ReturnType<typeof createClient>);
    expect((await updateGoal(new Request('https://app.test'),{params:{id:crypto.randomUUID()}})).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it('updates only the authenticated owner', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'reader@example.test'});
    const single=vi.fn().mockResolvedValue({data:{annual_reading_goal:24},error:null});
    const select=vi.fn().mockReturnValue({single}); const eq=vi.fn().mockReturnValue({select});
    const update=vi.fn().mockReturnValue({eq}); const from=vi.fn().mockReturnValue({update});
    vi.mocked(createClient).mockReturnValue({from} as unknown as ReturnType<typeof createClient>);
    const response=await updateGoal(new Request('https://app.test',{method:'PUT',body:JSON.stringify({goal:24})}),{params:{id:actor}});
    expect(response.status).toBe(200); expect(eq).toHaveBeenCalledWith('id',actor);
  });
});

import { decodeCursor, encodeCursor, cursorFilter } from '../src/lib/pagination';
import { verifyProviderSignature } from '../src/lib/webhook-security';
import { createHmac } from 'node:crypto';

describe('cursor and webhook contracts', () => {
  it('round trips cursors and rejects injected predicates', () => {
    const cursor={at:'2026-10-26T00:00:00.000Z',id:crypto.randomUUID()};
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(cursorFilter('created_at',cursor)).toContain(`id.lt.${cursor.id}`);
    expect(() => decodeCursor(Buffer.from(JSON.stringify({...cursor,id:"x') OR true"})).toString('base64url'))).toThrow();
  });
  it('uses the actual Paystack SHA-512 signature contract', () => {
    const body='{"event":"charge.success"}';
    const signature=createHmac('sha512','sandbox-secret').update(body).digest('hex');
    expect(verifyProviderSignature({provider:'paystack',body,secret:'sandbox-secret',signature})).toBe(true);
    expect(verifyProviderSignature({provider:'paystack',body:body+' ',secret:'sandbox-secret',signature})).toBe(false);
  });
});

vi.mock('@/lib/redis', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/redis')>(), getRedisClient: vi.fn() }));
import { getRedisClient } from '../src/lib/redis';
import { fetchWithRetry } from '../src/lib/retry';

describe('dependency circuit and retry budget', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('does not contact an open provider', async () => {
    const fetchMock=vi.fn(); vi.stubGlobal('fetch',fetchMock);
    vi.mocked(getRedisClient).mockReturnValue({get:vi.fn().mockResolvedValue('1')} as unknown as ReturnType<typeof getRedisClient>);
    await expect(fetchWithRetry('https://provider.test/resource')).rejects.toThrow('503');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not retry permanent HTTP failures', async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response('',{status:400}));vi.stubGlobal('fetch',fetchMock);
    vi.mocked(getRedisClient).mockReturnValue({get:vi.fn().mockResolvedValue(null),incrementWindow:vi.fn()} as unknown as ReturnType<typeof getRedisClient>);
    await expect(fetchWithRetry('https://provider.test/resource')).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

import { NextRequest } from 'next/server';
import { GET as recommendations } from '../src/app/api/ai/recommendations/route';

it('rejects recommendations for another user before accessing their preferences or cache', async () => {
  const actor=crypto.randomUUID();
  vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'reader@example.test'});
  vi.mocked(getRedisClient).mockReturnValue({incrementWindow:vi.fn().mockResolvedValue(1)} as unknown as ReturnType<typeof getRedisClient>);
  const response=await recommendations(new NextRequest(`https://app.test/api/ai/recommendations?userId=${crypto.randomUUID()}`));
  expect(response.status).toBe(403);
  expect(createClient).not.toHaveBeenCalled();
});

import { checkMoneyRateLimit } from '../src/lib/rate-limit';
import { RATE_LIMITS } from '../src/constants/config';

it('keeps the authenticated money quota when the client changes IP addresses', async () => {
  const counters=new Map<string,number>();
  vi.mocked(getRedisClient).mockReturnValue({
    get:vi.fn().mockResolvedValue(null), ttl:vi.fn().mockResolvedValue(60), set:vi.fn().mockResolvedValue('OK'),
    incrementWindow:vi.fn(async (key: string) => { const count=(counters.get(key)??0)+1;counters.set(key,count);return count; }),
  } as unknown as ReturnType<typeof getRedisClient>);
  for(let i=0;i<RATE_LIMITS.AUTH_MAX_ATTEMPTS;i++) expect((await checkMoneyRateLimit('actor',`203.0.113.${i}`)).allowed).toBe(true);
  expect((await checkMoneyRateLimit('actor','198.51.100.1')).allowed).toBe(false);
});


it('rejects malformed and lookalike origins without throwing', () => {
  expect(sameOrigin('not a URL','https://app.test')).toBe(false);
  expect(sameOrigin('https://app.test.evil.test/path','https://app.test')).toBe(false);
  expect(sameOrigin('https://app.test/path','https://app.test')).toBe(true);
});

import { PUT as updateLocale } from '../src/app/api/users/locale/route';

it('stores a supported locale for the authenticated owner and updates the browser cookie', async () => {
  const actor=crypto.randomUUID();
  vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'reader@example.test'});
  const eq=vi.fn().mockResolvedValue({error:null}); const update=vi.fn().mockReturnValue({eq});
  vi.mocked(createClient).mockReturnValue({from:vi.fn().mockReturnValue({update})} as unknown as ReturnType<typeof createClient>);
  const response=await updateLocale(new NextRequest('https://app.test/api/users/locale',{method:'PUT',body:JSON.stringify({locale:'fr'})}));
  expect(response.status).toBe(200); expect(eq).toHaveBeenCalledWith('id',actor);
  expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('fr');
});

it('bounds fan-out concurrency and stops scheduling after the deadline', async () => {
  const { mapBatches } = await import('@/lib/cron');
  let active = 0, peak = 0;
  const completed: number[] = [];
  const count = await mapBatches([1,2,3,4,5,6,7,8,9], 4, async item => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    completed.push(item); active--;
  });
  expect(peak).toBe(4);
  expect(count).toBe(9);
  expect(new Set(completed).size).toBe(9);
  expect(await mapBatches([1], 4, async () => { throw new Error('Past deadline'); }, Date.now() - 1)).toBe(0);
});


it('accepts app return paths and rejects OAuth authority and header injection', async () => {
  const { safeReturnPath } = await import('@/lib/utils');
  expect(safeReturnPath('/book/123?tab=reviews#latest')).toBe('/book/123?tab=reviews#latest');
  for(const path of [null,'@evil.test','.evil.test','//evil.test','https://evil.test','/\\evil.test','/path\r\nLocation: evil']) expect(safeReturnPath(path)).toBe('/');
});
