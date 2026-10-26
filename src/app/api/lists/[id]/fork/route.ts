import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export async function POST(request:Request,{params}:{params:{id:string}}) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const key=request.headers.get('idempotency-key');
  if(!key||key.length<8||key.length>200||!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid fork request'},{status:400});
  const {data,error}=await createServiceClient().rpc('fork_reading_list' as never,{p_user_id:user.id,p_source_id:params.id,p_key:key} as never);
  if(error)return NextResponse.json({error:'List fork unavailable'},{status:({P1001:409,P1004:400,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json({list:data},{status:201});
}
