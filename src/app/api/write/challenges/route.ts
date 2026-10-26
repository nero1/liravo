import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { writingChallengeResponse } from '@/lib/writing-intents';

export const dynamic = 'force-dynamic';

const CreateChallengeSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  challenge_type: z.enum(['weekly', 'monthly']),
  goal_type: z.enum(['word_count', 'submission_count']),
  goal_value: z.number().int().min(1),
  start_date: z.iso.date(),
  end_date: z.iso.date(),
}).refine(value => value.end_date >= value.start_date, {message:'End date must follow start date'});

export async function GET() {
  const supabase = createClient();

  const today = new Date().toISOString();

  const { data, error } = await supabase
    .from('writing_challenges')
    .select('*')
    .eq('is_active',true)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('end_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ challenges: (data ?? []).map(writingChallengeResponse) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!await isAdmin(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { name, challenge_type, start_date, end_date, ...fields } = parsed.data;
  const { data, error } = await createServiceClient()
    .from('writing_challenges')
    .insert({ ...fields, title: name, type: challenge_type, start_date: `${start_date}T00:00:00Z`, end_date: `${end_date}T23:59:59.999Z`, participant_count: 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ challenge: writingChallengeResponse(data) }, { status: 201 });
}
