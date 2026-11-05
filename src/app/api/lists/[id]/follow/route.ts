import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic='force-dynamic';

async function setFollowing(request:Request,id:string,following:boolean) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Invalid list'},{status:400});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const {error}=await createServiceClient().rpc('set_list_follow' as never,{p_user_id:user.id,p_list_id:id,p_following:following} as never);
  if(error)return NextResponse.json({error:'List follow unavailable'},{status:({P1003:403,P1004:400,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json({success:true,actorId:user.id,listId:id,following});
}

export async function POST(_request:Request,{params}:{params:{id:string}}) {return setFollowing(_request,params.id,true);}
export async function DELETE(_request:Request,{params}:{params:{id:string}}) {return setFollowing(_request,params.id,false);}
