import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic='force-dynamic';
const schema=z.object({target_books:z.number().int().min(1).max(10000),year:z.number().int().min(2020).max(2099).optional()});
export async function GET() {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const {data,error}=await createServiceClient().rpc('reading_goal_snapshot' as never,{p_user_id:user.id,p_year:new Date().getUTCFullYear()} as never);
  if(error)return NextResponse.json({error:'Reading progress unavailable'},{status:503});
  return NextResponse.json(data);
}
export async function POST(request:Request) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid goal'},{status:422});
  const {data,error}=await createServiceClient().rpc('set_reading_goal' as never,{p_user_id:user.id,p_year:parsed.data.year??new Date().getUTCFullYear(),p_target:parsed.data.target_books} as never);
  if(error)return NextResponse.json({error:'Goal update unavailable'},{status:error.code==='P1003'?403:503});
  return NextResponse.json({goal:data},{status:201});
}
