import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { dodoConnection } from '@/lib/payment-providers';
import { normalizeRefund } from '@/lib/payment-webhooks';
import { observeOperationalSignal } from '@/lib/operational-alerts';
import { recordMetric } from '@/lib/metrics';

const jobs=z.array(z.object({provider:z.enum(['paystack','dodopayments']),payment_id:z.string(),reason:z.string(),status:z.string(),provider_refund_id:z.string().nullable(),attempts:z.number().int().positive(),claim_token:z.string().uuid(),currency:z.enum(['USD','NGN','EUR']),charged_minor:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),refunded_minor:z.coerce.number().int().nonnegative()}));
type Job=z.infer<typeof jobs>[number];
function connection(provider:Job['provider']){
  if(provider==='dodopayments')return dodoConnection();
  const key=process.env.PAYSTACK_SECRET_KEY;if(!key)throw new Error('Paystack unavailable');
  return {key,base:'https://api.paystack.co'};
}
export async function readPaymentReturn(provider:Job['provider'],refundId:string,paymentId:string){
  const {key,base}=connection(provider);
  const response=await fetch(`${base}/${provider==='paystack'?'refund':'refunds'}/${encodeURIComponent(refundId)}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error('Refund verification unavailable');
  const result=await response.json(),data=provider==='paystack'?(result.status===true?result.data:null):result;
  if(!data||String(provider==='paystack'?data.id:data.refund_id)!==refundId)throw new Error('Refund identity mismatch');
  const remotePayment=provider==='paystack'?(typeof data.transaction==='object'?data.transaction?.id:data.transaction):data.payment_id;
  if(String(remotePayment)!==paymentId)throw new Error('Refund payment mismatch');
  if(data.status===(provider==='paystack'?'processed':'succeeded')){
    const refund=normalizeRefund({provider,event:provider==='paystack'?'refund.processed':'refund.succeeded',deliveryId:'reconciliation',data});
    if(!refund)throw new Error('Refund acknowledgement unavailable');
    return {status:'succeeded' as const,refund};
  }
  if(data.status==='failed')return {status:'failed' as const,refund:null};
  if(!['pending','processing','review'].includes(data.status))throw new Error('Unknown refund state');
  return {status:'submitted' as const,refund:null};
}
export async function verifyPaymentReturn(provider:Job['provider'],refundId:string,paymentId:string,correlationId:string){
  const evidence=await readPaymentReturn(provider,refundId,paymentId);
  if(evidence.refund){
    const refund=evidence.refund;
    const {data:applied,error}=await createServiceClient().rpc('process_refund_event' as never,{p_provider:provider,p_refund_id:refund.refundId,p_payment_id:refund.paymentId,p_amount_minor:refund.amountMinor,p_currency:refund.currency,p_correlation_id:correlationId} as never);
    if(error||typeof applied!=='boolean')throw new Error('Refund settlement unavailable');
    return 'verified' as const;
  }
  return evidence.status;
}

export async function drainPaymentReturns(correlationId:string){
  const db=createServiceClient(),{data,error}=await db.rpc('claim_payment_returns' as never,{p_limit:3} as never);
  if(error)throw new Error('Payment return queue unavailable');
  const claimed=jobs.parse(data);let completed=0,failed=0;
  await Promise.all(claimed.map(async job=>{
    let state=job.status;
    const persist=async(status:string,id:string|null,reason:string|null)=>{
      const {data:updated,error:updateError}=await db.rpc('update_payment_return' as never,{p_provider:job.provider,p_payment_id:job.payment_id,p_claim:job.claim_token,p_status:status,p_refund_id:id,p_error:reason} as never);
      if(updateError)throw new Error('Payment return persistence unavailable');
      return updated===true;
    };
    try{
      if(job.refunded_minor===job.charged_minor){await persist('completed',null,null);completed++;return;}
      const {key,base}=connection(job.provider);
      let refundId=job.provider_refund_id;
      if(!refundId){
        if(state!=='pending'){failed++;await persist('unknown',null,'PROVIDER_REFUND_REQUIRES_RECONCILIATION');await observeOperationalSignal('paymentFailures',correlationId);return;}
        // Commit the attempt before making a request whose acknowledgement can be lost.
        if(!await persist('processing',null,null))return;
        state='processing';
        const response=await fetch(`${base}/${job.provider==='paystack'?'refund':'refunds'}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`return_${job.provider}_${job.payment_id}`},signal:AbortSignal.timeout(8000),body:JSON.stringify(job.provider==='paystack'?{transaction:job.payment_id,amount:job.charged_minor-job.refunded_minor,currency:job.currency,merchant_note:`Liravo return ${job.payment_id}`}:{payment_id:job.payment_id,currency:job.currency,reason:'Liravo uncredited event or duplicate payment',metadata:{liravo_payment_return:job.payment_id}})});
        if(!response.ok)throw new Error('Refund acknowledgement unavailable');
        const result=await response.json();
        refundId=z.union([z.string().min(1).max(150),z.number().int().nonnegative()]).transform(String).parse(job.provider==='paystack'?(result.status===true?result.data?.id:null):result.refund_id);
        if(!await persist('processing',refundId,null))return;
      }
      const status=await verifyPaymentReturn(job.provider,refundId,job.payment_id,correlationId);
      if(status==='failed'){failed++;await persist('failed',refundId,'PROVIDER_REFUND_FAILED');await observeOperationalSignal('paymentFailures',correlationId);return;}
      if(status==='verified'){
        const {data:capture,error:lookupError}=await db.from('payment_captures').select('charged_minor,refunded_minor').eq('provider',job.provider).eq('payment_id',job.payment_id).single();
        if(lookupError||!capture)throw new Error('Refund balance unavailable');
        if(Number(capture.charged_minor)!==Number(capture.refunded_minor)){failed++;await persist('failed',refundId,'REFUND_REMAINDER_REQUIRES_RECONCILIATION');return;}
        await persist('completed',refundId,null);completed++;
      }else await persist('submitted',refundId,null);
    }catch{
      failed++;
      await persist(state==='pending'?'pending':'unknown',job.provider_refund_id,'PROVIDER_REFUND_REQUIRES_RECONCILIATION');
      await observeOperationalSignal('paymentFailures',correlationId);
      recordMetric('payment_return_pending',{provider:job.provider,correlationId,attempt:job.attempts},'warn');
    }
  }));
  return {scanned:claimed.length,completed,failed};
}
