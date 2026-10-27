import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid debate'},{status:400});
  const db=createServiceClient();
  const {data:debate,error}=await db.from('book_debates').select('id,book_id,user_id,question,yes_count,no_count,is_active,created_at').eq('id',params.id).maybeSingle();
  if(error)return NextResponse.json({error:'Debate unavailable'},{status:503});
  if(!debate)return NextResponse.json({error:'Debate not found'},{status:404});
  const {data:vote,error:voteError}=await db.from('debate_votes').select('vote').eq('debate_id',params.id).eq('user_id',user.id).maybeSingle();
  if(voteError)return NextResponse.json({error:'Vote unavailable'},{status:503});
  return NextResponse.json({debate:{...debate,current_vote:vote?.vote??null}});
}
