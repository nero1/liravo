import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// challenge_participants table not in generated types — using any cast
// Expected columns: challenge_id, user_id, joined_at

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify challenge exists and is active
  const now = new Date().toISOString();
  const { data: challenge } = await supabase 
    .from('challenges')
    .select('id, ends_at')
    .eq('id', params.id)
    .gte('ends_at', now)
    .single();

  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found or not active' }, { status: 404 });
  }

  const { error } = await supabase 
    .from('challenge_participants')
    .upsert({ challenge_id: params.id, user_id: user.id });

  if (error) {
    return NextResponse.json({ error: 'Failed to join challenge' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
