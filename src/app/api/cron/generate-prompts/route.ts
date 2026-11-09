import { cron } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { AI_MODELS } from '@/constants/ai';
import { fetchWithRetry } from '@/lib/retry';
import { safeModelText } from '@/lib/ai-safety';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const IDEMPOTENCY_KEY_PREFIX = 'cron:generate_prompts:v2:';

async function callDeepSeek(prompt: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const res = await fetchWithRetry('https://api.deepseek.com/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(8_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: AI_MODELS.DEEPSEEK_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a creative writing coach. Generate diverse, inspiring writing prompts for aspiring writers.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1000,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? null;
}

async function callGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST', signal: AbortSignal.timeout(8_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000 },
      }),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

function getNextSevenDays(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function parsePromptsFromAI(text: string, dates: string[]): { date: string; prompt_text: string; theme: string }[] {
  // Expect AI to return numbered list: 1. [Theme] Prompt text
  const lines = text.split('\n').filter((l) => l.trim());
  const results: { date: string; prompt_text: string; theme: string }[] = [];

  let dateIdx = 0;
  for (const line of lines) {
    if (dateIdx >= dates.length) break;
    // Match "1. [Theme] Prompt" or "1. Prompt"
    const match = line.match(/^\d+\.\s+(?:\[(.+?)\]\s+)?(.+)$/);
    if (match) {
      results.push({
        date: dates[dateIdx],
        theme: match[1] ?? 'General',
        prompt_text: match[2].trim(),
      });
      dateIdx++;
    }
  }

  return results.slice(0, dates.length);
}

async function run() {

  const redis = getRedisClient();
  const weekKey = `${IDEMPOTENCY_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;

  const dates = getNextSevenDays();
  const schema = z.array(z.object({ date: z.iso.date(), prompt_text: z.string().min(10).max(500).refine(safeModelText), theme: z.string().min(1).max(100).refine(safeModelText) })).length(7);
  let prompts: z.infer<typeof schema> | null = null;
  const cached = await redis.get(weekKey);
  if (cached) {
    try {
      const parsed = schema.safeParse(JSON.parse(cached));
      if (parsed.success && parsed.data.every((prompt,index)=>prompt.date===dates[index])) prompts=parsed.data;
    } catch { /* Invalid cache entries are regenerated. */ }
  }
  const themes = [
    'Adventure',
    'Loss & Grief',
    'First Encounter',
    'Secrets',
    'Identity',
    'Nature',
    'Unexpected Kindness',
  ];
  const themeList = themes.map((t, i) => `Day ${i + 1}: [${t}]`).join(', ');

  const userPrompt = `Generate 7 unique, inspiring writing prompts for the next 7 days. Format each as a numbered list with the theme in brackets and then the prompt.
Themes in order: ${themeList}.
Each prompt should be 1-3 sentences, vivid, and suitable for a short story or creative writing exercise.
Example: 1. [Adventure] A cartographer discovers a map that leads not to a place, but to a feeling they thought they had lost forever.`;

  if (!prompts) {
    const rawText = await callDeepSeek(userPrompt).catch(()=>null) ?? await callGemini(userPrompt).catch(()=>null);
    if (!rawText) return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
    const parsed = schema.safeParse(parsePromptsFromAI(rawText,dates));
    if (!parsed.success) return NextResponse.json({ error: 'AI returned incomplete or invalid prompts' }, { status: 502 });
    prompts=parsed.data;
    await redis.set(weekKey,JSON.stringify(prompts),{ex:60*60*24*8});
  }
  const supabase = createServiceClient();

  const inserted: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  for (const prompt of prompts) {
    const { data, error } = await supabase.rpc('publish_writing_prompt', {
      p_date: prompt.date, p_text: prompt.prompt_text, p_theme: prompt.theme,
    });
    const result = data as { created?: boolean } | null;
    if (error || typeof result?.created !== 'boolean') errors.push(prompt.date);
    else if (result.created) inserted.push(prompt.date);
    else skipped.push(prompt.date);
  }
  return NextResponse.json({ success: errors.length===0, inserted, skipped, errors, total:prompts.length }, {status:errors.length?503:200});
}

export const GET = cron('generate-prompts', run);
export const POST = GET;

export const maxDuration = 60;
