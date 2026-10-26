import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { awardXP } from '@/services/xp';

export const dynamic = 'force-dynamic';

const schema = z.object({ answer_id: z.string().uuid() });

// POST /api/write/questions/[id]/best-answer — asker marks the best answer
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();

  // Verify this question belongs to the current user
  const { data: question } = await supabase
    .from('writer_questions')
    .select('id, user_id, best_answer_id')
    .eq('id', params.id)
    .single();

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  if (question.user_id !== user.id) return NextResponse.json({ error: 'Not your question' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Verify the answer belongs to this question
  const { data: answer } = await supabase
    .from('ask_writer_answers')
    .select('id, user_id')
    .eq('id', parsed.data.answer_id)
    .eq('question_id', params.id)
    .single();

  if (!answer) return NextResponse.json({ error: 'Answer not found for this question' }, { status: 404 });

  const { error } = await supabase
    .from('writer_questions')
    .update({ best_answer_id: parsed.data.answer_id })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Award 20 XP to the answer author for having the best answer chosen
  if (answer.user_id && answer.user_id !== user.id) {
    await awardXP(answer.user_id, 20, 'best_answer_chosen', `best-answer:${params.id}`);
  }

  return NextResponse.json({ ok: true });
}
