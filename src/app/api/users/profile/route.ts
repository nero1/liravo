import {NOTIFICATION_KEYS} from '@/lib/notification-preferences';
import { NextRequest,NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import {clientUser,OWN_USER_COLUMNS} from '@/lib/user-profile';
import bcrypt from 'bcryptjs';
import {checkRouteRateLimit,checkCriticalRateLimit} from '@/lib/rate-limit';
import { GENRES,USER_TYPES } from '@/constants/config';

export const dynamic='force-dynamic';
const link=z.url().refine(value=>/^https?:\/\//.test(value));
const BodySchema=z.object({
  username:z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/).optional(),
  display_name:z.string().trim().min(1).max(50).optional(),
  bio:z.string().max(280).nullable().optional(),
  country:z.string().regex(/^[a-zA-Z]{2}$/).toUpperCase().nullable().optional(),
  avatar_url:link.nullable().optional(),avatar_upload_id:z.string().uuid().optional(),external_links:z.array(link).max(3).optional(),
  user_types:z.array(z.enum(USER_TYPES)).min(1).max(4).transform(value=>[...new Set(value)]).optional(),
  genres:z.array(z.enum(GENRES)).max(20).transform(value=>[...new Set(value)]).optional(),
  onboarding_complete:z.literal(true).optional(),pin:z.string().regex(/^\d{4}$/).optional(),
}).strict().refine(value=>Object.keys(value).length>0);
export async function PUT(request:NextRequest){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.get('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  const parsed=BodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid profile',code:'INVALID_PROFILE'},{status:422});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const {pin,...changes}=parsed.data;let pinHash:string|null=null;
  if(pin!==undefined){
    if(changes.onboarding_complete!==true)return NextResponse.json({error:'PIN setup requires onboarding'},{status:422});
    if(!(await checkCriticalRateLimit('pin:user:'+user.id)).allowed)return NextResponse.json({error:'Too many PIN attempts'},{status:429});
    const state=await createServiceClient().from('users').select('pin_hash,onboarding_complete').eq('id',user.id).single();
    if(state.error||!state.data)return NextResponse.json({error:'Profile unavailable'},{status:503});
    if(state.data.pin_hash){if(!await bcrypt.compare(pin,state.data.pin_hash))return NextResponse.json({error:'Incorrect current PIN'},{status:403});pinHash=state.data.pin_hash;}
    else{if(state.data.onboarding_complete)return NextResponse.json({error:'Use PIN settings after onboarding'},{status:422});pinHash=await bcrypt.hash(pin,12);}
  }
  const {data,error}=await createServiceClient().rpc('update_profile_atomic' as never,{p_user_id:user.id,p_changes:changes,p_pin_hash:pinHash} as never);
  if(error)return NextResponse.json({code:error.code==='23505'?'USERNAME_TAKEN':error.code==='P1001'?(pin!==undefined?'PIN_CHANGED':'PROFILE_CHANGED'):'PROFILE_UNAVAILABLE',error:error.code==='23505'?'Username is already taken':error.code==='P1004'?'Check your profile and choose at least five genres':'Profile update unavailable'},{status:({23505:409,P1001:409,P1003:403,P1004:422} as Record<string,number>)[error.code]??503});
  const safe=clientUser(data);if(!safe||safe.id!==user.id)return NextResponse.json({error:'Profile result unavailable'},{status:503});
  return NextResponse.json({ok:true,user:safe},{headers:{'Cache-Control':'private, no-store'}});
}

const NotificationSchema=z.object(Object.fromEntries(NOTIFICATION_KEYS.map(key=>[key,z.boolean().optional()]))).strict().refine(value=>Object.keys(value).length>0);
export async function PATCH(request:NextRequest){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.get('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  const parsed=NotificationSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid notification preferences'},{status:422});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const {data,error}=await createServiceClient().from('users').update(parsed.data).eq('id',user.id).is('deleted_at',null).eq('is_banned',false).select(OWN_USER_COLUMNS).maybeSingle();
  const safe=clientUser(data);
  if(error||!safe||safe.id!==user.id)return NextResponse.json({error:'Notification preferences unavailable'},{status:503});
  return NextResponse.json({ok:true,user:safe},{headers:{'Cache-Control':'private, no-store'}});
}
