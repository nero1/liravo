import { it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it('preserves the string Redis contract for numeric, boolean and JSON cache values', async () => {
  vi.stubEnv('REDIS_PROVIDER','upstash');
  vi.stubEnv('UPSTASH_REDIS_REST_URL','https://test.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','unit-test-placeholder');
  let stored='1';
  vi.stubGlobal('fetch',vi.fn(async (url: string) => {
    const result={result:Buffer.from(stored).toString('base64')};
    return new Response(JSON.stringify(String(url).endsWith('/pipeline') ? [result] : result),{headers:{'Content-Type':'application/json'}});
  }));
  const { getRedisClient } = await import('../src/lib/redis');
  for (const value of ['1','true','{"books":[]}']) {
    stored=value;
    expect(await getRedisClient().get('cache-key')).toBe(value);
  }
});
