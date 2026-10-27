import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const now=new Date().toISOString();
  const {data,error}=await createServiceClient().from('challenges').select('id,title,description,type,cadence,goal_books,goal_pages,start_date,end_date,is_active,created_at').eq('is_active',true).or(`start_date.is.null,start_date.lte.${now}`).or(`end_date.is.null,end_date.gt.${now}`).order('end_date').limit(100);
  if(error)return NextResponse.json({error:'Challenges unavailable'},{status:503});
  return NextResponse.json({challenges:data??[]});
}
