import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP } from '@/services/xp';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CreateQuestionSchema = z.object({
  question: z.string().min(10).max(280),
  tags: z.array(z.string().max(50)).max(5).optional(),
});

export async function GET(req: Request) {
  const supabase = createClient();
  const url = new URL(req.url);
  const filter = url.searchParams.get('filter') ?? 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = 20;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from('ask_writer_questions')
    .select(
      'id, question, tags, answer_count, created_at, author:user_id(display_name, username)',
      { count: 'exact' }
    );

  if (filter === 'unanswered') {
    query = query.eq('answer_count', 0);
  } else if (filter === 'most_answered') {
    query = query.order('answer_count', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, count, error } = await query.range(from, from + pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    questions: data ?? [],
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  let question;
  try {
    const intent = await contentIntent(req, user.id, 'ask_writer_questions', { question: parsed.data.question, tags: parsed.data.tags ?? [], answer_count: 0 });
    question = await intent.insert();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Content creation unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }

  // Award 5 XP for asking
  await awardXP(user.id, 5, 'ask_question', `question:${question.id}`);

  return NextResponse.json({ question }, { status: 201 });
}
