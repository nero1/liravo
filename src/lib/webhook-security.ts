import crypto from 'crypto';
import { getRedisClient } from '@/lib/redis';

export function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyHmacSha256({
  body,
  secret,
  signature,
  timestamp,
}: {
  body: string;
  secret: string;
  signature: string;
  timestamp?: string;
}): boolean {
  const payload = timestamp ? `${timestamp}.${body}` : body;
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return safeCompare(digest, signature);
}

export function isFreshTimestamp(timestamp: string, toleranceSeconds = 300): boolean {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - parsed) <= toleranceSeconds;
}

export async function detectReplay(eventId: string, ttlSeconds = 60 * 30): Promise<boolean> {
  const redis = getRedisClient();
  const replayKey = `webhook:event:${eventId}`;
  const inserted = await redis.setNx(replayKey, '1');
  if (!inserted) return true;
  await redis.expire(replayKey, ttlSeconds);
  return false;
}
