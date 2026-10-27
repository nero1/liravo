import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic='force-dynamic';
export async function GET() {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const {data,error}=await createServiceClient().rpc('writing_progress_snapshot' as never,{p_user_id:user.id} as never);
  if(error||!data)return NextResponse.json({error:'Writing progress unavailable'},{status:503});
  return NextResponse.json(data);
}
