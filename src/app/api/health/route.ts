import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  const version = '1.0.0';

  // Check database
  let databaseStatus: 'ok' | 'error' = 'ok';
  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('pg_sleep', { seconds: 0 }).maybeSingle();
    if (error && error.code !== 'PGRST202') {
      // Try simpler query
      const { error: err2 } = await supabase
        .from('feature_flags')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      if (err2) databaseStatus = 'error';
    }
  } catch {
    databaseStatus = 'error';
  }

  // Check Redis
  let redisStatus: 'ok' | 'error' = 'ok';
  try {
    const redis = getRedisClient();
    const testKey = `health_check:${Date.now()}`;
    await redis.set(testKey, '1', { ex: 10 });
    const val = await redis.get(testKey);
    if (val !== '1') redisStatus = 'error';
    await redis.del(testKey);
  } catch {
    redisStatus = 'error';
  }

  const status = databaseStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';

  return NextResponse.json({
    status,
    timestamp,
    version,
    services: {
      database: databaseStatus,
      redis: redisStatus,
    },
  });
}
