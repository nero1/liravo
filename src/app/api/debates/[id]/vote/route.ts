import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid debate'},{status:400});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=z.object({vote:z.enum(['yes','no'])}).safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid vote'},{status:400});
  const {data,error}=await createServiceClient().rpc('cast_debate_vote',{p_user_id:user.id,p_debate_id:params.id,p_vote:parsed.data.vote});
  if(error)return NextResponse.json({error:'Vote unavailable'},{status:({P1001:409,P1003:403,P1004:409,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json({...data as object,actorId:user.id,debateId:params.id});
}
