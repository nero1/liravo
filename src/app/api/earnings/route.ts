import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getCreatorBalance, PAYOUT_CURRENCIES } from '@/lib/earnings';
import {readAccountPin} from '@/lib/account-pin';
import { decodeCursor, encodeCursor } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(request:Request) {
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const params=new URL(request.url).searchParams;
  const currency=params.get('currency')??'USD';
  if(!PAYOUT_CURRENCIES.includes(currency as typeof PAYOUT_CURRENCIES[number])) return NextResponse.json({error:'Invalid currency'},{status:400});
  let cursor;
  try {cursor=decodeCursor(params.get('cursor'));}
  catch {return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try {
    const summary=await getCreatorBalance(user.id,currency as typeof PAYOUT_CURRENCIES[number]);
    let query=createServiceClient().from('payout_requests').select('id,amount,currency,status,method,created_at').eq('user_id',user.id).eq('currency',currency).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
    if(cursor) query=query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
    const {data,error}=await query;
    if(error || !Array.isArray(data)) throw new Error('Payout history unavailable');
    const payouts=data.slice(0,50);
    const last=payouts[payouts.length-1];
    return NextResponse.json({...summary,pinRequired:!!await readAccountPin(user.id),tipsReceived:summary.tips,referralCommissions:summary.referrals,eventRevenue:summary.events,totalEarnings:summary.earned,payouts,nextCursor:data.length>50?encodeCursor({at:last.created_at,id:last.id}):null});
  }catch { return NextResponse.json({error:'Earnings unavailable'},{status:503}); }
}
