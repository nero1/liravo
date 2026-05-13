import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP } from '@/services/xp';

const AnswerSchema = z.object({
  answer: z.string().min(20).max(5000),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check eligibility: must be author, verified_author, or have XP > 1000
  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, user_types, xp')
    .eq('id', user.id)
    .single();

  const isAuthor = profile?.user_types?.includes('author') ?? false;
  const isVerifiedAuthor = profile?.is_verified_author ?? false;
  const hasHighXP = (profile?.xp ?? 0) > 1000;

  if (!isAuthor && !isVerifiedAuthor && !hasHighXP) {
    return NextResponse.json(
      {
        error:
          'You must be an author or have more than 1000 XP to answer questions.',
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

  const parsed = AnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Check question exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: question } = await (supabase as any)
    .from('writer_questions')
    .select('id, answer_count')
    .eq('id', params.id)
    .single();

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: answer, error } = await (supabase as any)
    .from('writer_answers')
    .insert({
      user_id: user.id,
      question_id: params.id,
      answer: parsed.data.answer,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment answer count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('writer_questions')
    .update({ answer_count: (question.answer_count ?? 0) + 1 })
    .eq('id', params.id);

  // Award 10 XP for answering
  await awardXP(user.id, 10, 'answer_question');

  return NextResponse.json({ answer }, { status: 201 });
}
