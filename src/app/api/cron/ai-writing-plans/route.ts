import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { AI_MODELS } from '@/constants/ai';

export const dynamic = 'force-dynamic';

interface UserProfile {
  id: string;
  genres: string[];
  display_name: string;
}

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
            'You are a creative writing coach. Generate personalised weekly writing plans for aspiring writers.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
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
        generationConfig: { maxOutputTokens: 600 },
      }),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function parseTasksFromAI(text: string): { day: string; task: string; goal: string }[] {
  const lines = text.split('\n').filter((l) => l.trim());
  const tasks: { day: string; task: string; goal: string }[] = [];

  let dayIdx = 0;
  for (const line of lines) {
    if (dayIdx >= DAYS.length) break;
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match) {
      const [taskPart, goalPart] = match[1].split('|').map((s) => s.trim());
      tasks.push({
        day: DAYS[dayIdx],
        task: taskPart ?? match[1],
        goal: goalPart ?? '',
      });
      dayIdx++;
    }
  }

  // Fill in defaults if needed
  while (tasks.length < DAYS.length) {
    const idx = tasks.length;
    tasks.push({
      day: DAYS[idx],
      task: 'Free writing session — write whatever comes to mind for 20 minutes.',
      goal: '300 words',
    });
  }

  return tasks.slice(0, DAYS.length);
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  const weekStart = new Date(now);
  weekStart.setDate(diff);
  return weekStart.toISOString().split('T')[0];
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const weekStart = getWeekStart();

  // Get all premium newbie_writer users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, genres, display_name')
    .contains('user_types', ['newbie_writer', 'creator']);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const results = { generated: 0, skipped: 0, errors: 0 };

  for (const user of (users as UserProfile[]) ?? []) {
    // Check if plan already exists for this week
    const { data: existing } = await supabase
      .from('writing_plans')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    if (existing) {
      results.skipped++;
      continue;
    }

    const genres = (user.genres ?? []).slice(0, 3).join(', ') || 'general fiction';

    const prompt = `Generate a personalised 5-day writing plan for a writer interested in: ${genres}.
Create 5 daily writing tasks (Monday through Friday). Format each as a numbered list:
1. Task description | Goal (e.g., 500 words or 20 minutes)
Keep each task focused, achievable, and creative. Vary the exercises (character development, scene writing, dialogue, world-building, reflection).`;

    let rawText = await callDeepSeek(prompt);
    if (!rawText) {
      rawText = await callGemini(prompt);
    }

    if (!rawText) {
      results.errors++;
      continue;
    }

    const tasks = parseTasksFromAI(rawText);

    const { error: insertError } = await supabase
      .from('writing_plans')
      .insert({
        user_id: user.id,
        week_start_date: weekStart,
        tasks,
        generated_at: new Date().toISOString(),
      });

    if (insertError) {
      results.errors++;
    } else {
      results.generated++;
    }
  }

  return NextResponse.json({ success: true, week_start: weekStart, ...results });
}
