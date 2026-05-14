import { getRedisClient } from '@/lib/redis';

export async function withRedisLock<T>(
  key: string,
  ttlSeconds: number,
  task: () => Promise<T>
): Promise<T | null> {
  const redis = getRedisClient();
  const lockKey = `lock:${key}`;
  const ownerToken = `${Date.now()}:${Math.random()}`;
  const acquired = await redis.setNx(lockKey, ownerToken);
  if (!acquired) return null;

  await redis.expire(lockKey, ttlSeconds);
  try {
    return await task();
  } finally {
    // Bugfix: release only if this worker still owns the lock token.
    const currentOwner = await redis.get(lockKey);
    if (currentOwner === ownerToken) {
      await redis.del(lockKey);
    }
  }
}
