import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP } from '@/services/xp';
import { checkAndAwardBadges } from '@/services/badges';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const SubmitSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  word_count: z.number().int().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Check challenge exists and is active
  const { data: challenge } = await supabase
    .from('writing_challenges')
    .select('id, end_date')
    .eq('id', params.id)
    .single();

  if (!challenge) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });

  const today = new Date().toISOString().split('T')[0];
  if (challenge.end_date < today) {
    return NextResponse.json({ error: 'Challenge has ended' }, { status: 409 });
  }

  // Insert entry
  const { data: entry, error } = await supabase
    .from('writing_challenge_entries')
    .insert({
      user_id: user.id,
      challenge_id: params.id,
      title: parsed.data.title,
      body: parsed.data.body,
      word_count: parsed.data.word_count,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Award 25 XP
  await awardXP(user.id, 25, 'challenge_submission');

  // Check completion badges
  await checkAndAwardBadges(user.id, 'challenge_submit');
  await checkAndAwardBadges(user.id, 'prolific_writer');

  return NextResponse.json({ entry }, { status: 201 });
}
