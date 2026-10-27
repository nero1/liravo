import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid challenge'},{status:400});
  const db=createServiceClient();
  const {data:challenge,error}=await db.from('challenges').select('id,title,description,type,cadence,goal_books,goal_pages,start_date,end_date,is_active,created_at').eq('id',params.id).maybeSingle();
  if(error)return NextResponse.json({error:'Challenge unavailable'},{status:503});
  if(!challenge)return NextResponse.json({error:'Challenge not found'},{status:404});
  const [participants,progress]=await Promise.all([
    db.from('challenge_participants').select('user_id',{count:'exact',head:true}).eq('challenge_id',params.id),
    db.rpc('reading_challenge_progress' as never,{p_user_id:user.id,p_challenge_id:params.id} as never),
  ]);
  if(participants.error||progress.error)return NextResponse.json({error:'Challenge progress unavailable'},{status:503});
  return NextResponse.json({challenge:{...challenge,participant_count:participants.count??0},...progress.data as object});
}
