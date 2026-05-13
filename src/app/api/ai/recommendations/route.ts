import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { AI_MODELS } from '@/constants/ai';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const QuerySchema = z.object({
  userId: z.string().uuid().optional(),
  mood: z.string().optional(),
});

const DEEPSEEK_FAIL_KEY = 'ai:deepseek:failures';
const DEEPSEEK_CIRCUIT_OPEN_KEY = 'ai:deepseek:circuit_open';
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_WINDOW_SECONDS = 300; // 5 min
const CIRCUIT_OPEN_SECONDS = 600;  // 10 min
const CACHE_TTL_SECONDS = 3600;    // 1 hour

interface Recommendation {
  title: string;
  author: string;
  reason: string;
}

async function isCircuitOpen(): Promise<boolean> {
  const redis = getRedisClient();
  const val = await redis.get(DEEPSEEK_CIRCUIT_OPEN_KEY);
  return val === '1';
}

async function recordDeepSeekFailure(): Promise<void> {
  const redis = getRedisClient();
  const count = await redis.incr(DEEPSEEK_FAIL_KEY);
  if (count === 1) {
    await redis.expire(DEEPSEEK_FAIL_KEY, CIRCUIT_WINDOW_SECONDS);
  }
  if (count >= CIRCUIT_FAILURE_THRESHOLD) {
    await redis.set(DEEPSEEK_CIRCUIT_OPEN_KEY, '1', { ex: CIRCUIT_OPEN_SECONDS });
    await redis.del(DEEPSEEK_FAIL_KEY);
  }
}

async function callDeepSeek(prompt: string): Promise<Recommendation[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API key not configured');

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_MODELS.DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '';
  return parseRecommendations(content);
}

async function callGemini(prompt: string): Promise<Recommendation[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

  const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseRecommendations(content);
}

function parseRecommendations(content: string): Recommendation[] {
  // Try to extract JSON array from the response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    return (parsed as Array<{ title?: unknown; author?: unknown; reason?: unknown }>)
      .filter((item) => item && typeof item === 'object' && item.title && item.author)
      .map((item) => ({
        title: String(item.title ?? ''),
        author: String(item.author ?? ''),
        reason: String(item.reason ?? ''),
      }))
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    userId: searchParams.get('userId') ?? undefined,
    mood: searchParams.get('mood') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  }

  const { userId, mood } = parsed.data;

  // Determine genres from user profile if userId provided
  let genres: string[] = [];
  if (userId) {
    const supabase = createClient();
    const { data: profile } = await supabase
      .from('users')
      .select('genres')
      .eq('id', userId)
      .single();
    genres = profile?.genres ?? [];
  }

  // Cache key
  const cacheKey = `ai:recommendations:${userId ?? 'anon'}:${mood ?? 'none'}:${genres.slice(0, 3).join(',')}`;
  const redis = getRedisClient();

  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json({ recommendations: JSON.parse(cached) as Recommendation[], cached: true });
  }

  const genresStr = genres.length > 0 ? genres.slice(0, 5).join(', ') : 'general fiction';
  const moodStr = mood ? ` The reader is in a "${mood}" mood.` : '';
  const prompt = `You are a book recommendation expert. Based on these preferred genres: ${genresStr}.${moodStr} Suggest exactly 5 books. Return ONLY a JSON array with objects having "title", "author", and "reason" (one sentence) fields. No other text.

Example format:
[{"title": "Book Name", "author": "Author Name", "reason": "Why this book fits"}]`;

  let recommendations: Recommendation[] = [];

  try {
    const circuitOpen = await isCircuitOpen();
    if (circuitOpen) {
      // Use Gemini as fallback
      recommendations = await callGemini(prompt);
    } else {
      try {
        recommendations = await callDeepSeek(prompt);
      } catch {
        await recordDeepSeekFailure();
        // Fallback to Gemini
        recommendations = await callGemini(prompt);
      }
    }

    if (recommendations.length > 0) {
      await redis.set(cacheKey, JSON.stringify(recommendations), { ex: CACHE_TTL_SECONDS });
    }

    return NextResponse.json({ recommendations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate recommendations', details: message },
      { status: 500 }
    );
  }
}
