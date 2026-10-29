import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:{id:string}}) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid target'},{status:400});
  const {data,error}=await createServiceClient().rpc('join_content_group' as never,{p_user_id:user.id,p_kind:'reading_room',p_target:params.id} as never);
  if(error||!data)return NextResponse.json({error:'Membership unavailable'},{status:({P1003:403,P1004:409,P1005:404} as Record<string,number>)[error?.code??'']??503});
  return NextResponse.json({...data as Record<string,unknown>,actorId:user.id,roomId:params.id});
}
