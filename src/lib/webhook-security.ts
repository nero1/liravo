import { Webhook } from 'standardwebhooks';
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
    return signature.trim();
  }
  return null;
}

export function verifyProviderSignature(params: {
  provider: string;
  body: string;
  secret: string;
  signature: string;
  timestamp?: string | null;
  webhookId?: string;
}): boolean {
  const normalizedSignature = normalizeProviderSignature(params.provider, params.signature);
  if (!normalizedSignature) return false;

  if (params.provider === 'dodopayments') {
    if (!params.timestamp || !params.webhookId) return false;
    try {
      new Webhook(params.secret).verify(params.body, {
        'webhook-id': params.webhookId,
        'webhook-timestamp': params.timestamp,
        'webhook-signature': params.signature,
      });
      return true;
    } catch { return false; }
  }

  if (params.provider === 'paystack') {
    // Bugfix: paystack verification uses raw request body without timestamp prefix.
    const digest = crypto.createHmac('sha512', params.secret).update(params.body).digest('hex');
    return safeCompare(digest, normalizedSignature);
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
