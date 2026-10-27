import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRouteRateLimit } from '@/lib/rate-limit';
export async function POST(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');
  if(!z.string().uuid().safeParse(params.id).success||!key||key.length<8||key.length>200)return NextResponse.json({error:'Invalid click intent'},{status:400});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const {data,error}=await createServiceClient().rpc('record_promotion_click' as never,{p_actor:user.id,p_id:params.id,p_key:key} as never);
  if(error)return NextResponse.json({error:'Promotion click unavailable'},{status:({P1001:409,P1003:403,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json(data);
}
