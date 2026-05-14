import IORedis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  setNx(key: string, value: string): Promise<boolean | number>;
  setNxEx?(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

let _client: RedisClient | null = null;

function createIoRedisClient(): RedisClient {
  const redis = new IORedis(process.env.REDIS_URL!, { lazyConnect: true });

  return {
    async get(key) { return redis.get(key); },
    async set(key, value, options) {
      if (options?.ex) return redis.set(key, value, 'EX', options.ex);
      return redis.set(key, value);
    },
    async del(key) { return Array.isArray(key) ? redis.del(...key) : redis.del(key); },
    async incr(key) { return redis.incr(key); },
    async expire(key, seconds) { return redis.expire(key, seconds); },
    async ttl(key) { return redis.ttl(key); },
    async setNx(key, value) { return redis.setnx(key, value); },
    async setNxEx(key, value, ttlSeconds) {
      const result = await redis.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    },
  };
}

function createUpstashClient(): RedisClient {
  const redis = new UpstashRedis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  return {
    async get(key) {
      const val = await redis.get<string>(key);
      return val ?? null;
    },
    async set(key, value, options) {
      if (options?.ex) return redis.set(key, value, { ex: options.ex });
      return redis.set(key, value);
    },
    async del(key) { return Array.isArray(key) ? redis.del(...key) : redis.del(key); },
    async incr(key) { return redis.incr(key); },
    async expire(key, seconds) { return redis.expire(key, seconds); },
    async ttl(key) { return redis.ttl(key); },
    async setNx(key, value) {
      const result = await redis.set(key, value, { nx: true });
      return result !== null;
    },
    async setNxEx(key, value, ttlSeconds) {
      const result = await redis.set(key, value, { nx: true, ex: ttlSeconds });
      return result !== null;
    },
  };
}

export function getRedisClient(): RedisClient {
  if (_client) return _client;
  const provider = process.env.REDIS_PROVIDER ?? 'upstash';
  _client = provider === 'ioredis' ? createIoRedisClient() : createUpstashClient();
  return _client;
}

export const REDIS_KEYS = {
  book: (id: string) => `book:${id}`,
  feed: (userId: string, cursor: string) => `feed:${userId}:cursor:${cursor}`,
  leaderboard: (type: string) => `leaderboard:${type}`,
  affiliateLink: (bookId: string, country: string) => `affiliate_link:${bookId}:${country}`,
  featureFlag: (flag: string) => `feature_flag:${flag}`,
  rateLimitAuth: (ip: string) => `ratelimit:auth:${ip}`,
} as const;

export const REDIS_TTL = {
  FEED: 300,          // 5 minutes
  BOOK: 86400,        // 24 hours
  LEADERBOARD: 3600,  // 1 hour
  AFFILIATE_LINK: 86400,
  FEATURE_FLAG: 60,
} as const;
