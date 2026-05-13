import crypto from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { AI_MODELS } from '@/constants/ai';

export type ToneResult = 'positive' | 'neutral' | 'negative' | 'toxic';

const CACHE_TTL = 600; // 10 minutes

export async function classifyTone(text: string): Promise<ToneResult> {
  const snippet = text.slice(0, 100);
  const hash = crypto.createHash('sha256').update(snippet).digest('hex');
  const cacheKey = `tone:${hash}`;

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached && ['positive', 'neutral', 'negative', 'toxic'].includes(cached)) {
      return cached as ToneResult;
    }
  } catch {
    // Redis unavailable — proceed to classify
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return 'neutral';

    const prompt = `Classify the tone of the following text as exactly one of: positive, neutral, negative, toxic.
Reply with only the single word classification.

Text: ${text.slice(0, 1000)}

Classification:`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODELS.DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) return 'neutral';

    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim().toLowerCase() ?? '';

    const validTones: ToneResult[] = ['positive', 'neutral', 'negative', 'toxic'];
    const tone: ToneResult = validTones.includes(content as ToneResult)
      ? (content as ToneResult)
      : 'neutral';

    try {
      const redis = getRedisClient();
      await redis.set(cacheKey, tone, { ex: CACHE_TTL });
    } catch {
      // Cache set failed — ignore
    }

    return tone;
  } catch {
    return 'neutral';
  }
}
