/**
 * Central AI client with DeepSeek primary, Gemini fallback, and Redis circuit breaker.
 * All AI calls in the codebase should go through callAI().
 *
 * Circuit breaker: 3 DeepSeek failures within 5 min → open circuit for 10 min (all traffic → Gemini).
 */
import { getRedisClient } from '@/lib/redis';
import { AI_MODELS } from '@/constants/ai';
import { withExponentialBackoff } from '@/lib/retry';

const FAIL_KEY = 'ai:deepseek:failures';
const CIRCUIT_KEY = 'ai:deepseek:circuit_open';
const FAILURE_THRESHOLD = 3;
const CIRCUIT_WINDOW_S = 300;  // 5 min
const CIRCUIT_OPEN_S = 600;    // 10 min

async function isCircuitOpen(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    return (await redis.get(CIRCUIT_KEY)) === '1';
  } catch {
    return false;
  }
}

async function recordFailure(): Promise<void> {
  try {
    const redis = getRedisClient();
    const count = await redis.incr(FAIL_KEY);
    if (count === 1) await redis.expire(FAIL_KEY, CIRCUIT_WINDOW_S);
    if (count >= FAILURE_THRESHOLD) {
      await redis.set(CIRCUIT_KEY, '1', { ex: CIRCUIT_OPEN_S });
      await redis.del(FAIL_KEY);
    }
  } catch {
    // Redis unavailable — continue without circuit breaker
  }
}

export interface AICallOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

async function callDeepSeek(prompt: string, opts: AICallOptions): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API key not configured');

  const messages = [
    ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
    { role: 'user', content: prompt },
  ];

  const res = await withExponentialBackoff(
    () => fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODELS.DEEPSEEK_MODEL,
        messages,
        temperature: opts.temperature ?? 0.7,
        ...(opts.maxTokens && { max_tokens: opts.maxTokens }),
      }),
      signal: AbortSignal.timeout(8000),
    }),
    { retries: 1 }
  );

  if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(prompt: string, opts: AICallOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const contents = [
    ...(opts.system ? [{ role: 'model', parts: [{ text: opts.system }] }] : []),
    { role: 'user', parts: [{ text: prompt }] },
  ];

  const res = await withExponentialBackoff(
    () => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal: AbortSignal.timeout(8000),
      }
    ),
    { retries: 1 }
  );

  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Call AI with DeepSeek → Gemini fallback and circuit breaker.
 * Returns { text, provider } where provider is 'deepseek' or 'gemini'.
 */
export async function callAI(
  prompt: string,
  opts: AICallOptions = {}
): Promise<{ text: string; provider: 'deepseek' | 'gemini' }> {
  const circuitOpen = await isCircuitOpen();

  if (!circuitOpen) {
    try {
      const text = await callDeepSeek(prompt, opts);
      return { text, provider: 'deepseek' };
    } catch {
      await recordFailure();
      // Fall through to Gemini
    }
  }

  const text = await callGemini(prompt, opts);
  return { text, provider: 'gemini' };
}
