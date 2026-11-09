import {leaseSignal} from '@/lib/locks';
import { getRedisClient } from '@/lib/redis';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export class HttpError extends Error {
  constructor(public readonly status: number) { super(`HTTP ${status}`); }
}

export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, code, name, cause } = error as { status?: number; code?: string; name?: string; cause?: unknown };
  if (status !== undefined) return status === 429 || (status >= 500 && status <= 599);
  return name === 'TimeoutError' || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code ?? '')
    || (cause !== undefined && isTransientError(cause));
}

/** Retries classified transient failures only; delays are capped milliseconds with full jitter. */
export async function withExponentialBackoff<T>(op: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = Math.min(5, Math.max(0, options.retries ?? 3));
  for (let attempt = 0; ; attempt++) {
    try { return await op(); } catch (error) {
      if (attempt >= retries || !(options.shouldRetry?.(error, attempt) ?? isTransientError(error))) throw error;
      const cap = Math.min(options.maxDelayMs ?? 2000, (options.baseDelayMs ?? 150) * 2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, Math.random() * cap));
    }
  }
}

/** Per-provider circuit: 5 transient failures/minute opens for 30s; at most 20 retries/minute. */
export async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  const lease=leaseSignal(),signal=AbortSignal.any([init?.signal??AbortSignal.timeout(15000),...(lease?[lease]:[])]);
  const redis = getRedisClient();
  const provider = new URL(input).hostname;
  const prefix = `dependency:${provider}`;
  if (await redis.get(`${prefix}:open`)) throw new HttpError(503);
  let attempt = 0;
  return withExponentialBackoff(async () => {
    if (await redis.get(`${prefix}:open`)) throw new Error('Dependency circuit open');
    if (attempt++ > 0 && await redis.incrementWindow(`${prefix}:retries`, 60) > 20) throw new Error('Dependency retry budget exceeded');
    try {
      signal.throwIfAborted();
      const response = await fetch(input, { ...init, signal });
      if (!response.ok) throw new HttpError(response.status);
      await redis.del(`${prefix}:failures`);
      return response;
    } catch (error) {
      if (isTransientError(error) && await redis.incrementWindow(`${prefix}:failures`, 60) >= 5) {
        await redis.set(`${prefix}:open`, '1', { ex: 30 });
      }
      throw error;
    }
  }, { retries: 2, shouldRetry: error => isTransientError(error) && attempt < 3 });
}
