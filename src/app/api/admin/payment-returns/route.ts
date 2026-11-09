import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';
import { readPaymentReturn } from '@/lib/payment-returns';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { getClientIp,getRequestCorrelationId } from '@/lib/utils';

export const dynamic='force-dynamic';
export async function GET(){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const db=createServiceClient();
  const {data:returns,error}=await db.from('payment_returns').select('provider,payment_id,reason,status,provider_refund_id,last_error,created_at').neq('status','completed').order('created_at').limit(50);
  if(error)return NextResponse.json({error:'Payment returns unavailable'},{status:503});
  if(!returns?.length)return NextResponse.json({returns:[]});
  const {data:captures,error:lookupError}=await db.from('payment_captures').select('provider,payment_id,currency,charged_minor,refunded_minor').in('payment_id',returns.map(row=>row.payment_id));
  if(lookupError)return NextResponse.json({error:'Payment captures unavailable'},{status:503});
  return NextResponse.json({returns:returns.map(row=>({...row,...captures?.find(capture=>capture.provider===row.provider&&capture.payment_id===row.payment_id)}))},{headers:{'Cache-Control':'private, no-store'}});
}
const schema=z.object({provider:z.enum(['paystack','dodopayments']),payment_id:z.string().min(1).max(150),refund_id:z.string().min(1).max(150)}).strict();
export async function POST(request:Request){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  if(!(await checkMoneyRateLimit(guard.userId,getClientIp(request))).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  const body=schema.safeParse(await request.json().catch(()=>null)),key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');
  if(!body.success||!key||key.length<8||key.length>200)return NextResponse.json({error:'Invalid refund intent'},{status:400});
  try{
    const value=body.data,evidence=await readPaymentReturn(value.provider,value.refund_id,value.payment_id);
    if(evidence.status==='failed')return NextResponse.json({error:'Provider refund failed'},{status:409});
    const {data,error}=await createServiceClient().rpc('reconcile_payment_return',{p_actor:guard.userId,p_provider:value.provider,p_payment_id:value.payment_id,p_refund_id:value.refund_id,p_key:key,p_evidence:evidence,p_correlation_id:getRequestCorrelationId(request)});
    if(error)return NextResponse.json({error:'Refund reconciliation unavailable'},{status:({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503});
    return NextResponse.json(data);
  }catch{return NextResponse.json({error:'Verified provider refund unavailable'},{status:503});}
}
