import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// debate_votes table not in generated types — using any cast
// Expected columns: debate_id, user_id, vote (yes|no), created_at

const VoteSchema = z.object({
  vote: z.enum(['yes', 'no']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = VoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { vote } = parsed.data;

  // Check if user already voted
  const { data: existingVote } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('debate_votes')
    .select('vote')
    .eq('debate_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingVote) {
    return NextResponse.json({ error: 'Already voted' }, { status: 409 });
  }

  // Insert vote
  const { error: voteError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('debate_votes')
    .insert({ debate_id: params.id, user_id: user.id, vote });

  if (voteError) {
    return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
  }

  // Update count on debate
  const field = vote === 'yes' ? 'yes_count' : 'no_count';

  // Get current count
  const { data: debate } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('book_debates')
    .select(`${field}`)
    .eq('id', params.id)
    .single();

  if (debate) {
    const current = (debate[field] as number) ?? 0;
    await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('book_debates')
      .update({ [field]: current + 1 })
      .eq('id', params.id);
  }

  return NextResponse.json({ success: true, vote });
}
