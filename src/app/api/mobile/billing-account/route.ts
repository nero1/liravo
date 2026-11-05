import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { googlePlayAccountId } from '@/lib/google-play';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  if (!(await checkMoneyRateLimit(user.id,getClientIp(request))).allowed) return NextResponse.json({error:'Too many requests'},{status:429});
  try {
    const accountId = googlePlayAccountId(user.id);
    const {data,error} = await createServiceClient().rpc('register_billing_account' as never,{p_user_id:user.id,p_account_id:accountId} as never);
    if (error || data !== accountId) throw new Error('Account binding unavailable');
    return NextResponse.json({accountId,actorId:user.id});
  } catch { return NextResponse.json({error:'Google Play billing is unavailable',code:'BILLING_CONFIGURATION_UNAVAILABLE'},{status:503}); }
}
