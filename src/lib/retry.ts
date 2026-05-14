export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
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
      const retryAllowed = options.shouldRetry ? options.shouldRetry(error, attempt) : true;
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
