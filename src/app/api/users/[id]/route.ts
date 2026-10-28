import {getEarnedBadges} from '@/services/badges';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
import { PUBLIC_USER_COLUMNS } from '@/lib/user-profile';
export async function GET(_request:Request,{params}:{params:{id:string}}){
  const actor=await getCurrentUser();if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!/^[\w-]{1,50}$/.test(params.id))return NextResponse.json({error:'Invalid username'},{status:400});
  const db=createServiceClient();
  const {data:profile,error}=await db.from('users').select(PUBLIC_USER_COLUMNS).eq('username',params.id).eq('is_banned',false).is('deleted_at',null).maybeSingle();
  if(error)return NextResponse.json({error:'Profile unavailable'},{status:503});
  if(!profile)return NextResponse.json({error:'Profile not found'},{status:404});
  const {data:following,error:followError}=await db.from('follows').select('follower_id').eq('follower_id',actor.id).eq('following_id',profile.id).maybeSingle();
  if(followError)return NextResponse.json({error:'Profile unavailable'},{status:503});
  if(profile.profile_visibility==='followers_only'&&profile.id!==actor.id&&!following)return NextResponse.json({error:'Only followers can view this profile'},{status:403});
  const [followers,follows]=await Promise.all([
    db.from('follows').select('follower_id',{count:'exact',head:true}).eq('following_id',profile.id),
    db.from('follows').select('following_id',{count:'exact',head:true}).eq('follower_id',profile.id),
  ]);
  if(followers.error||follows.error)return NextResponse.json({error:'Profile unavailable'},{status:503});
  let badges;try{badges=await getEarnedBadges(profile.id);}catch{return NextResponse.json({error:'Badges unavailable'},{status:503});}
  return NextResponse.json({user:{...profile,badges,is_following:!!following,followers_count:followers.count??0,following_count:follows.count??0}},{headers:{'Cache-Control':'private, no-store'}});
}
