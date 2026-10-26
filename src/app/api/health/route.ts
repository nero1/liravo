import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  let databaseStatus: 'ok' | 'error' = 'ok';
  try {
    const { error } = await createServiceClient().from('feature_flags').select('name').limit(1);
    if (error) databaseStatus = 'error';
  } catch { databaseStatus = 'error'; }

  let redisStatus: 'ok' | 'error' = 'ok';
  try {
    const redis = getRedisClient();
    const testKey = `health_check:${crypto.randomUUID()}`;
    await redis.set(testKey, '1', { ex: 10 });
    if (await redis.get(testKey) !== '1') redisStatus = 'error';
    await redis.del(testKey);
  } catch { redisStatus = 'error'; }

  return NextResponse.json({
    status: databaseStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
    timestamp, version: '1.0.0', services: { database: databaseStatus, redis: redisStatus },
  });
}
