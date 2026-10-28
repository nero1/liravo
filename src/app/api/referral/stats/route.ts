import {NextResponse} from 'next/server';
import {getReferralStatistics} from '@/services/referrals';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
export const dynamic='force-dynamic';
export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json(await getReferralStatistics(user.id),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'Referral statistics unavailable'},{status:503});}
}
