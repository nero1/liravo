import { getRedisClient, REDIS_KEYS } from '@/lib/redis';
import { RATE_LIMITS } from '@/constants/config';

export async function checkAuthRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  try {
    const redis = getRedisClient();
    const key = REDIS_KEYS.rateLimitAuth(ip);
    const windowSeconds = RATE_LIMITS.AUTH_WINDOW_MINUTES * 60;
    const lockoutKey = `${key}:lockout`;

    const lockout = await redis.get(lockoutKey);
    if (lockout) {
      const ttl = await redis.ttl(lockoutKey);
      return { allowed: false, remaining: 0, resetAt: Date.now() + ttl * 1000 };
    }

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, RATE_LIMITS.AUTH_MAX_ATTEMPTS - count);

    if (count > RATE_LIMITS.AUTH_MAX_ATTEMPTS) {
      await redis.set(lockoutKey, '1', { ex: RATE_LIMITS.AUTH_LOCKOUT_MINUTES * 60 });
      return { allowed: false, remaining: 0, resetAt: Date.now() + RATE_LIMITS.AUTH_LOCKOUT_MINUTES * 60 * 1000 };
    }

    const ttl = await redis.ttl(key);
    return { allowed: true, remaining, resetAt: Date.now() + ttl * 1000 };
  } catch {
    // Bugfix: fail-open fallback avoids total auth outage when Redis is down.
    return { allowed: true, remaining: RATE_LIMITS.AUTH_MAX_ATTEMPTS, resetAt: Date.now() + 60_000 };
  }
}
