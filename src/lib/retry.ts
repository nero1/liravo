export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // network fetch failures
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('network') || msg.includes('429') || msg.includes('5');
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withExponentialBackoff<T>(
  op: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 150;
  const maxDelayMs = options.maxDelayMs ?? 2000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      lastError = error;
      // Bugfix: default retries only for transient failures to prevent retry storms on permanent/4xx errors.
      const retryAllowed = options.shouldRetry ? options.shouldRetry(error, attempt) : isTransientError(error);
      if (attempt >= retries || !retryAllowed) {
        break;
      }

      const jitter = Math.floor(Math.random() * 100);
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt + jitter);
      await sleep(delay);
    }
  }

  throw lastError;
}
