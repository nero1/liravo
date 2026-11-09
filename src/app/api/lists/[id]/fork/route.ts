import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  const key=request.headers.get('idempotency-key');
  if(!key||key.length<8||key.length>200||!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid fork request'},{status:400});
  const {data,error}=await createServiceClient().rpc('fork_reading_list',{p_user_id:user.id,p_source_id:params.id,p_key:key});
  if(error)return NextResponse.json({error:'List fork unavailable'},{status:({P1001:409,P1004:400,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json({list:data,actorId:user.id,sourceId:params.id},{status:201});
}
