import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkRouteRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const schema=z.object({current_chapter:z.number().int().min(1).max(100000).optional(),note:z.string().trim().min(1).max(2000).optional()}).strict().refine(value=>Object.keys(value).length>0);
export async function PATCH(req:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=req.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const key=req.headers.get('idempotency-key')??req.headers.get('x-idempotency-key');
  if(!z.string().uuid().safeParse(params.id).success||!key||key.length<8||key.length>200)return NextResponse.json({error:'Invalid progress intent'},{status:400});
  const parsed=schema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid progress'},{status:422});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const {data,error}=await createServiceClient().rpc('update_buddy_progress' as never,{p_actor_id:user.id,p_room_id:params.id,p_key:key,p_payload:parsed.data} as never);
  if(error){const status=({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503;return NextResponse.json({error:status===503?'Progress unavailable':error.message},{status});}
  if(!data||typeof data!=='object')return NextResponse.json({error:'Progress unavailable'},{status:503});
  return NextResponse.json({...data,actorId:user.id,roomId:params.id});
}
