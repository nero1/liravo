import { getRedisClient, REDIS_KEYS } from '@/lib/redis';
import { RATE_LIMITS } from '@/constants/config';

async function checkRateLimit(ip: string, failOpen: boolean): Promise<{
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

    const count = await redis.incrementWindow(key, windowSeconds);

    const remaining = Math.max(0, RATE_LIMITS.AUTH_MAX_ATTEMPTS - count);

    if (count > RATE_LIMITS.AUTH_MAX_ATTEMPTS) {
      await redis.set(lockoutKey, '1', { ex: RATE_LIMITS.AUTH_LOCKOUT_MINUTES * 60 });
      return { allowed: false, remaining: 0, resetAt: Date.now() + RATE_LIMITS.AUTH_LOCKOUT_MINUTES * 60 * 1000 };
    }

    const ttl = await redis.ttl(key);
    return { allowed: true, remaining, resetAt: Date.now() + ttl * 1000 };
  } catch {
    if (failOpen) {
      // Bugfix: fail-open fallback avoids total auth outage when Redis is down.
      return { allowed: true, remaining: RATE_LIMITS.AUTH_MAX_ATTEMPTS, resetAt: Date.now() + 60_000 };
    }
    // Bugfix: fail-closed on high-risk money endpoints when limiter backend is unavailable.
    return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };
  }
}

export async function checkAuthRateLimit(ip: string) {
  return checkRateLimit(ip, true);
}

export async function checkCriticalRateLimit(ip: string) {
  return checkRateLimit(ip, false);
}

const ROUTE_LIMITS = { catalog:{max:20,seconds:60}, ai: { max: 30, seconds: 60 }, social: { max: 120, seconds: 60 } } as const;

/** Per-account risk quotas fail closed when the shared counter is unavailable. */
export async function checkRouteRateLimit(identity: string, tier: keyof typeof ROUTE_LIMITS): Promise<boolean> {
  const policy = ROUTE_LIMITS[tier];
  try {
    const key = `ratelimit:${tier}:${identity}`;
    const count = await getRedisClient().incrementWindow(key, policy.seconds);
    return count <= policy.max;
  } catch { return false; }
}

/** A new IP never resets the account quota; unknown ingress does not pool unrelated users. */
export async function checkMoneyRateLimit(userId: string, ip: string) {
  const account = await checkCriticalRateLimit(`money:user:${userId}`);
  if (!account.allowed || ip === 'unknown') return account;
  return checkCriticalRateLimit(`money:ip:${ip}`);
}
