import { getRedisClient } from '@/lib/redis';

export async function ensureIdempotency(key: string, ttlSeconds = 60): Promise<boolean> {
  const redis = getRedisClient();
  const namespaced = `idem:${key}`;
  const inserted = await redis.setNx(namespaced, '1');
  if (!inserted) return false;
  await redis.expire(namespaced, ttlSeconds);
  return true;
}
