import { getRedisClient } from '@/lib/redis';
import crypto from 'crypto';

export async function withRedisLock<T>(
  key: string,
  ttlSeconds: number,
  task: () => Promise<T>
): Promise<T | null> {
  const redis = getRedisClient();
  const lockKey = `lock:${key}`;
  // Bugfix: use cryptographically strong lock token to avoid predictable lock ownership.
  const ownerToken = crypto.randomUUID();
  // Bugfix: acquire lock atomically with TTL (NX + EX) to prevent orphaned lock deadlocks.
  const acquired = redis.setNxEx
    ? await redis.setNxEx(lockKey, ownerToken, ttlSeconds)
    : await redis.setNx(lockKey, ownerToken);
  if (!acquired) return null;

  if (!redis.setNxEx) {
    await redis.expire(lockKey, ttlSeconds);
  }
  // Bugfix: heartbeat lock TTL during long critical sections to reduce accidental expiry/races.
  const heartbeat = setInterval(async () => {
    try {
      const currentOwner = await redis.get(lockKey);
      if (currentOwner === ownerToken) {
        await redis.expire(lockKey, ttlSeconds);
      }
    } catch {
      // best-effort heartbeat
    }
  }, Math.max(1000, Math.floor((ttlSeconds * 1000) / 2)));
  try {
    return await task();
  } finally {
    clearInterval(heartbeat);
    // Bugfix: release only if this worker still owns the lock token.
    const currentOwner = await redis.get(lockKey);
    if (currentOwner === ownerToken) {
      await redis.del(lockKey);
    }
  }
}
