import {createServiceClient} from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { writingChallengeResponse } from '@/lib/writing-intents';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: challenge, error } = await supabase
    .from('writing_challenges')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !challenge) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const viewer=await getCurrentUser();
  const {data:leaderboard,error:leaderboardError}=await createServiceClient().rpc('writing_challenge_leaderboard' as never,{p_challenge:params.id,p_viewer:viewer?.id??null} as never);
  if(leaderboardError||!Array.isArray(leaderboard))return NextResponse.json({error:'Leaderboard unavailable'},{status:503});

  const membership = viewer ? await supabase.from('writing_challenge_participants').select('user_id').eq('challenge_id',params.id).eq('user_id',viewer.id).maybeSingle() : null;
  if (membership?.error) return NextResponse.json({ error: 'Membership unavailable' }, { status: 503 });
  const entry=viewer?await supabase.from('writing_challenge_submissions').select('id,user_id,title,content,word_count').eq('challenge_id',params.id).eq('user_id',viewer.id).maybeSingle():null;
  if(entry?.error)return NextResponse.json({error:'Entry unavailable'},{status:503});
  return NextResponse.json({actorId:viewer?.id??null,joined:!!membership?.data,challenge:writingChallengeResponse(challenge),entry:entry?.data??null,leaderboard},{headers:{'Cache-Control':'private, no-store'}});
}
