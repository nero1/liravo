import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';
import { decodeCursor, encodeCursor, cursorFilter } from '@/lib/pagination';

export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!await isAdmin(user.id))return NextResponse.json({error:'Forbidden'},{status:403});
  let cursor;try{cursor=decodeCursor(new URL(request.url).searchParams.get('cursor'));}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  let query=createServiceClient().from('payout_requests').select('id,user_id,amount,currency,method,status,destination,created_at,last_error,idempotency_key').in('status',['pending','processing']).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
  if(cursor)query=query.or(cursorFilter('created_at',cursor));
  const {data,error}=await query;
  if(error||!Array.isArray(data))return NextResponse.json({error:'Payout queue unavailable'},{status:503});
  const payouts=data.slice(0,50),last=payouts.at(-1);
  return NextResponse.json({payouts:payouts.map(({idempotency_key,...row})=>({...row,legacy:idempotency_key?.startsWith('legacy_tip_payout:')??false})),nextCursor:data.length>50&&last?encodeCursor({at:last.created_at,id:last.id}):null});
}
