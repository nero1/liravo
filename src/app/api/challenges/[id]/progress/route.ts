import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function GET(_request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid challenge'},{status:400});
  const {data,error}=await createServiceClient().rpc('reading_challenge_progress',{p_user_id:user.id,p_challenge_id:params.id});
  if(error)return NextResponse.json({error:'Challenge unavailable'},{status:({P1003:403,P1004:409,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json(data);
}
