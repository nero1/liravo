import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';
import { getRequestCorrelationId } from '@/lib/utils';
import { processPayout } from '@/lib/payout-settlement';

export const dynamic='force-dynamic';
export const maxDuration=60;
const manual=z.object({settlementReference:z.string().trim().min(4).max(200),amount:z.string().regex(/^\d+(\.\d{1,2})?$/),currency:z.enum(['USD','NGN','EUR']),action:z.enum(['settle','releaseLegacy']).default('settle')});
export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!(await isAdmin(user.id))) return NextResponse.json({error:'Forbidden'},{status:403});
  if(!z.string().uuid().safeParse(params.id).success) return NextResponse.json({error:'Invalid payout'},{status:400});
  const correlationId=getRequestCorrelationId(request);
  const raw=await request.text();
  if(Buffer.byteLength(raw)>4096) return NextResponse.json({error:'Payload too large'},{status:413});
  try {
    if(raw.trim()) {
      const parsed=manual.safeParse(JSON.parse(raw));
      if(!parsed.success) return NextResponse.json({error:'Invalid settlement receipt'},{status:400});
      const release=parsed.data.action==='releaseLegacy';
      const {data,error}=await createServiceClient().rpc((release?'release_legacy_payout_request':'settle_payout_request'),{p_actor_id:user.id,p_payout_id:params.id,...(!release?{p_status:'completed',p_provider_code:null}:{}),p_reference:parsed.data.settlementReference,p_amount:parsed.data.amount,p_currency:parsed.data.currency,p_correlation_id:correlationId});
      if(error) throw Object.assign(new Error('Settlement unavailable'),{code:error.code});
      return NextResponse.json({processed:data==='completed',status:data,correlationId});
    }
    const result=await processPayout(params.id,user.id,correlationId);
    return NextResponse.json({...result,correlationId},{status:result.pending?202:200});
  }catch(error) {
    const code=error instanceof Error&&'code' in error?String(error.code):'';
    return NextResponse.json({error:'Payout processing unavailable',code,correlationId},{status:code==='P1003'?403:code==='P1005'?404:['P1001','P1002','P1004','23505'].includes(code)?409:error instanceof SyntaxError?400:503});
  }
}
