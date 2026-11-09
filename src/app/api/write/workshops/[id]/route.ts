import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { ContentIntentError } from '@/lib/content-intents';
import { requireWorkshopMember } from '@/lib/workshops';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  try{await requireWorkshopMember(params.id,user.id);}catch(error){return NextResponse.json({error:'Workshop unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
  const supabase = (await createClient());

  const { data: room, error } = await supabase
    .from('workshop_rooms')
    .select('id,name,topic,member_count,max_members,is_active,facilitator_id,created_at')
    .eq('id', params.id)
    .maybeSingle();

  if(error)return NextResponse.json({error:'Workshop unavailable'},{status:503});
  if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: members,error:membersError } = await supabase
    .from('workshop_members')
    .select('user_id, users:user_id(display_name, username)')
    .eq('room_id', params.id);

  if(membersError)return NextResponse.json({error:'Members unavailable'},{status:503});
  if(new URL(request.url).searchParams.get('summary')==='1')return NextResponse.json({actorId:user.id,room,members:members??[]},{headers:{'Cache-Control':'private, no-store'}});

  const { data: submissions,error:submissionsError } = await supabase
    .from('workshop_submissions')
    .select('id, title, excerpt, word_count, created_at, user_id, users:user_id(display_name, username)')
    .eq('room_id', params.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if(submissionsError)return NextResponse.json({error:'Submissions unavailable'},{status:503});

  // Fetch feedback for each submission
  let submissionsWithFeedback;try{submissionsWithFeedback=await Promise.all(
      (submissions ?? []).map(async (sub: { id: string; [key: string]: unknown }) => {
        const { data: feedback,error:feedbackError } = await supabase
          .from('workshop_feedback')
          .select('id, comment, created_at, user_id, users:user_id(display_name, username)')
          .eq('submission_id', sub.id)
          .order('created_at', { ascending: true });
        if(feedbackError)throw new Error('Feedback unavailable');
        return { ...sub, feedback: feedback ?? [] };
      })
    );}catch{return NextResponse.json({error:'Feedback unavailable'},{status:503});}

  return NextResponse.json({actorId:user.id,room, members: members ?? [], submissions: submissionsWithFeedback });
}
