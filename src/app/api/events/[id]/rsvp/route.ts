import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export const dynamic='force-dynamic';
export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid target'},{status:400});
  const {data,error}=await createServiceClient().rpc('join_content_group',{p_user_id:user.id,p_kind:'event',p_target:params.id});
  if(request.headers.get('content-type')?.includes('application/x-www-form-urlencoded'))return new Response(null,{status:303,headers:{Location:`/events/${params.id}${error?'?error=rsvp':''}`}});
  if(error)return NextResponse.json({error:'Membership unavailable'},{status:({P1003:403,P1004:409,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json(data);
}
