import IORedis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  incrementWindow(key: string, seconds: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  setNx(key: string, value: string): Promise<boolean | number>;
  compareExpire(key: string, owner: string, seconds: number): Promise<unknown>;
  compareDelete(key: string, owner: string): Promise<unknown>;
  setOwned(key:string,owner:string,target:string,value:string,seconds:number):Promise<unknown>;
  setNxEx?(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

let _client: RedisClient | null = null;

function createIoRedisClient(): RedisClient {
  const redis = new IORedis(process.env.REDIS_URL!, {connectTimeout:3000,commandTimeout:3000,maxRetriesPerRequest:1});

  return {
    async compareExpire(key, owner, seconds) { return redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('expire',KEYS[1],ARGV[2]) else return 0 end", 1, key, owner, seconds); },
    async setOwned(key,owner,target,value,seconds){return redis.eval("if redis.call('get',KEYS[1])~=ARGV[1]then return 0 end;redis.call('set',KEYS[2],ARGV[2],'EX',ARGV[3]);return 1",2,key,target,owner,value,seconds);},
    async compareDelete(key, owner) { return redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, owner); },
    async get(key) { return redis.get(key); },
    async set(key, value, options) {
      if (options?.ex) return redis.set(key, value, 'EX', options.ex);
      return redis.set(key, value);
    },
    async del(key) { return Array.isArray(key) ? redis.del(...key) : redis.del(key); },
    async incr(key) { return redis.incr(key); },
    async incrementWindow(key, seconds) {
      return Number(await redis.eval("local n=redis.call('incr',KEYS[1]); if n==1 then redis.call('expire',KEYS[1],ARGV[1]) end; return n", 1, key, seconds));
    },
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
    automaticDeserialization: false,
  });

  return {
    async compareExpire(key, owner, seconds) { return redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('expire',KEYS[1],ARGV[2]) else return 0 end", [key], [owner, seconds]); },
    async setOwned(key,owner,target,value,seconds){return redis.eval("if redis.call('get',KEYS[1])~=ARGV[1]then return 0 end;redis.call('set',KEYS[2],ARGV[2],'EX',ARGV[3]);return 1",[key,target],[owner,value,seconds]);},
    async compareDelete(key, owner) { return redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", [key], [owner]); },
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
    async incrementWindow(key, seconds) {
      return Number(await redis.eval("local n=redis.call('incr',KEYS[1]); if n==1 then redis.call('expire',KEYS[1],ARGV[1]) end; return n", [key], [seconds]));
    },
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
