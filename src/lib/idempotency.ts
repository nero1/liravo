import { getRedisClient } from '@/lib/redis';

export async function ensureIdempotency(key: string, ttlSeconds = 60): Promise<boolean> {
  const redis = getRedisClient();
  const namespaced = `idem:${key}`;
  const inserted = await redis.setNx(namespaced, '1');
  if (!inserted) return false;
  await redis.expire(namespaced, ttlSeconds);
  return true;
}

export type IdempotencyClaimResult = 'new' | 'replay' | 'conflict';

export async function claimIdempotency(
  key: string,
  fingerprint: string,
  ttlSeconds = 60
): Promise<IdempotencyClaimResult> {
  const redis = getRedisClient();
  const namespaced = `idem:${key}`;
  const inserted = redis.setNxEx
    ? await redis.setNxEx(namespaced, fingerprint, ttlSeconds)
    : await redis.setNx(namespaced, fingerprint);

  if (inserted) {
    if (!redis.setNxEx) await redis.expire(namespaced, ttlSeconds);
    return 'new';
  }

  const existing = await redis.get(namespaced);
  if (existing === fingerprint) return 'replay';
  return 'conflict';
}
