import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRedisClient } from '@/lib/redis';
import { AI_MODELS } from '@/constants/ai';
import crypto from 'crypto';
import { withExponentialBackoff } from '@/lib/retry';

const FeedbackSchema = z.object({
  text: z.string().min(10).max(10000),
  type: z.enum(['grammar', 'style', 'structure', 'overall']),
});

const FEEDBACK_PROMPTS: Record<string, string> = {
  grammar: 'Review the following writing for grammar, punctuation, and spelling errors. Be specific and constructive.',
  style: 'Analyse the writing style of the following passage. Comment on voice, tone, word choice, and rhythm. Be constructive.',
  structure: 'Analyse the structure of the following writing. Comment on pacing, organisation, paragraph flow, and logical progression. Be constructive.',
  overall: 'Provide comprehensive writing feedback on the following passage covering grammar, style, structure, and clarity. Be specific and constructive.',
};

async function callDeepSeek(prompt: string, text: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const res = await withExponentialBackoff(
    async () => fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODELS.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text },
        ],
        max_tokens: 800,
      }),
    }),
    { retries: 2 }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? null;
}

async function callGemini(prompt: string, text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const res = await withExponentialBackoff(
    async () => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt}\n\n${text}` }] }],
          generationConfig: { maxOutputTokens: 800 },
        }),
      }
    ),
    { retries: 2 }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Premium check
  const { data: profile } = await supabase
    .from('users')
    .select('user_types')
    .eq('id', user.id)
    .single();

  const isPremium =
    profile?.user_types?.includes('creator') ??
    profile?.user_types?.includes('author') ??
    false;

  if (!isPremium) {
    return NextResponse.json(
      {
        error: 'AI writing feedback is a premium feature. Upgrade your account to access it.',
        upgrade_url: '/settings/account',
      },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { text, type } = parsed.data;
  const cacheKey = `ai_feedback:${crypto.createHash('sha256').update(`${type}:${text}`).digest('hex')}`;

  const redis = getRedisClient();
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json({ feedback: cached, cached: true });
  }

  const systemPrompt = FEEDBACK_PROMPTS[type];
  let feedback = await callDeepSeek(systemPrompt, text);
  if (!feedback) {
    feedback = await callGemini(systemPrompt, text);
  }

  if (!feedback) {
    return NextResponse.json({ error: 'AI service unavailable. Please try again later.' }, { status: 503 });
  }

  // Cache for 1 hour
  await redis.set(cacheKey, feedback, { ex: 3600 });

  return NextResponse.json({ feedback });
}
