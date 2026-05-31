import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP, incrementStreak } from '@/services/xp';
import { checkAndAwardBadges } from '@/services/badges';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const SubmitSchema = z.object({
  content: z.string().min(50).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const wordCount = parsed.data.content.trim().split(/\s+/).length;

  // Check prompt exists
  const { data: prompt } = await supabase
    .from('writing_prompts')
    .select('id')
    .eq('id', params.id)
    .single();

  if (!prompt) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });

  // Check already submitted
  const { data: existing } = await supabase
    .from('prompt_submissions')
    .select('id')
    .eq('user_id', user.id)
    .eq('prompt_id', params.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Already submitted for this prompt' }, { status: 409 });
  }

  // Insert submission
  const { data: submission, error } = await supabase
    .from('prompt_submissions')
    .insert({
      user_id: user.id,
      prompt_id: params.id,
      content: parsed.data.content,
      word_count: wordCount,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Award XP and update streak
  await awardXP(user.id, 10, 'prompt_submission');
  await incrementStreak(user.id);

  // Check badges
  await checkAndAwardBadges(user.id, 'prompt_submit');
  await checkAndAwardBadges(user.id, 'writing_streak');
  await checkAndAwardBadges(user.id, 'prolific_writer');

  return NextResponse.json({ submission }, { status: 201 });
}
