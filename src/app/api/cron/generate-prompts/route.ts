import { cron } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { AI_MODELS } from '@/constants/ai';

export const dynamic = 'force-dynamic';

const IDEMPOTENCY_KEY_PREFIX = 'cron:generate_prompts:';

async function callDeepSeek(prompt: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
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
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
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

  // If parsing failed or incomplete, fill in with generic prompts
  while (results.length < dates.length) {
    const idx = results.length;
    results.push({
      date: dates[idx],
      theme: 'General',
      prompt_text: `Write about a character who discovers something unexpected. Let your imagination guide the story.`,
    });
  }

  return results.slice(0, dates.length);
}

async function run() {

  const redis = getRedisClient();
  const weekKey = `${IDEMPOTENCY_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;

  // Idempotency check
  const alreadyRan = await redis.get(weekKey);
  if (alreadyRan) {
    return NextResponse.json({ message: 'Already generated prompts this week', cached: true });
  }

  const dates = getNextSevenDays();
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

  let rawText = await callDeepSeek(userPrompt);
  if (!rawText) {
    rawText = await callGemini(userPrompt);
  }

  if (!rawText) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  // Cache raw AI output for idempotency
  await redis.set(weekKey, rawText, { ex: 60 * 60 * 24 * 8 }); // 8 days

  const prompts = parsePromptsFromAI(rawText, dates);
  const supabase = createServiceClient();

  // Upsert prompts (skip if date already exists)
  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const p of prompts) {
    const { error } = await supabase
      .from('writing_prompts')
      .upsert(p, { onConflict: 'date', ignoreDuplicates: true });

    if (error) {
      skipped.push(p.date);
    } else {
      inserted.push(p.date);
    }
  }

  return NextResponse.json({
    success: true,
    inserted,
    skipped,
    total: prompts.length,
  });
}

export const GET = cron('generate-prompts', run);
export const POST = GET;

export const maxDuration = 60;
