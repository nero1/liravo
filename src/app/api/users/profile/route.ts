import { NextRequest,NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { clientUser } from '@/lib/user-profile';
import { GENRES,USER_TYPES } from '@/constants/config';

export const dynamic='force-dynamic';
const link=z.url().refine(value=>/^https?:\/\//.test(value));
const BodySchema=z.object({
  username:z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/).optional(),
  display_name:z.string().trim().min(1).max(50).optional(),
  bio:z.string().max(280).nullable().optional(),
  country:z.string().regex(/^[a-zA-Z]{2}$/).toUpperCase().nullable().optional(),
  avatar_url:link.nullable().optional(),external_links:z.array(link).max(3).optional(),
  user_types:z.array(z.enum(USER_TYPES)).min(1).max(4).transform(value=>[...new Set(value)]).optional(),
  genres:z.array(z.enum(GENRES)).max(20).transform(value=>[...new Set(value)]).optional(),
  onboarding_complete:z.literal(true).optional(),
}).strict().refine(value=>Object.keys(value).length>0);
export async function PUT(request:NextRequest){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const parsed=BodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid profile'},{status:422});
  const {data,error}=await createServiceClient().rpc('update_profile_atomic' as never,{p_user_id:user.id,p_changes:parsed.data} as never);
  if(error)return NextResponse.json({error:error.code==='23505'?'Username is already taken':error.code==='P1004'?'Check your profile and choose at least five genres':'Profile update unavailable'},{status:({23505:409,P1003:403,P1004:422} as Record<string,number>)[error.code]??503});
  return NextResponse.json({ok:true,user:clientUser(data)},{headers:{'Cache-Control':'private, no-store'}});
}
