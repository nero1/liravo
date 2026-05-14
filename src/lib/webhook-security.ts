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

export function normalizeProviderSignature(provider: string, signature: string): string | null {
  if (provider === 'paystack') {
    return signature.trim().toLowerCase();
  }
  if (provider === 'dodopayments') {
    const normalized = signature.trim().toLowerCase();
    const parts = normalized.split('=');
    if (parts.length === 2 && ['sha256', 'v1'].includes(parts[0])) return parts[1];
    return normalized;
  }
  return null;
}

export function verifyProviderSignature(params: {
  provider: string;
  body: string;
  secret: string;
  signature: string;
  timestamp?: string | null;
}): boolean {
  const normalizedSignature = normalizeProviderSignature(params.provider, params.signature);
  if (!normalizedSignature) return false;

  if (params.provider === 'dodopayments') {
    // Bugfix: enforce timestamp-bound signatures for dodo-style canonical payloads.
    if (!params.timestamp || !isFreshTimestamp(params.timestamp)) return false;
    return verifyHmacSha256({
      body: params.body,
      secret: params.secret,
      signature: normalizedSignature,
      timestamp: params.timestamp,
    });
  }

  if (params.provider === 'paystack') {
    // Bugfix: paystack verification uses raw request body without timestamp prefix.
    return verifyHmacSha256({
      body: params.body,
      secret: params.secret,
      signature: normalizedSignature,
    });
  }

  return false;
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
  const inserted = redis.setNxEx
    ? await redis.setNxEx(replayKey, '1', ttlSeconds)
    : await redis.setNx(replayKey, '1');
  if (!inserted) return true;
  if (!redis.setNxEx) await redis.expire(replayKey, ttlSeconds);
  return false;
}
