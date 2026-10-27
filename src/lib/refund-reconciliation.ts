import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { dodoConnection } from '@/lib/payment-providers';
import { normalizeSubscription, normalizeTip, normalizeTicket, paymentMetadata, type PaymentNotice } from '@/lib/payment-webhooks';
import { observeOperationalSignal } from '@/lib/operational-alerts';
import { recordMetric } from '@/lib/metrics';

const refunds=z.array(z.object({provider:z.enum(['paystack','dodopayments']),refund_id:z.string(),payment_id:z.string(),amount_minor:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),currency:z.string(),attempts:z.number().int(),correlation_id:z.string().nullable()}));
export async function fetchCapturedPayment(provider:'paystack'|'dodopayments',paymentId:string) {
  const connection=provider==='paystack'?{key:process.env.PAYSTACK_SECRET_KEY,base:'https://api.paystack.co'}:dodoConnection();
  if(!connection.key)throw new Error('Payment provider unavailable');
  const response=await fetch(`${connection.base}/${provider==='paystack'?'transaction':'payments'}/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${connection.key}`},signal:AbortSignal.timeout(6_000)});
  if(!response.ok)throw new Error('Captured payment lookup unavailable');
  const result=await response.json();
  const data=provider==='paystack'?(result.status===true?result.data:null):result;
  if(!data||String(provider==='paystack'?data.id:data.payment_id)!==paymentId||data.status!==(provider==='paystack'?'success':'succeeded'))throw new Error('Captured payment identity unavailable');
  return capturedPaymentEvent(provider,data);
}
export async function capturedPaymentEvent(provider:'paystack'|'dodopayments',data:Record<string,unknown>){
  if(data.status!==(provider==='paystack'?'success':'succeeded'))throw new Error('Payment is not captured');
  const notice:PaymentNotice={provider,event:provider==='paystack'?'charge.success':'payment.succeeded',deliveryId:'reconciliation',timestamp:z.string().optional().parse(data.created_at),data};
  if(provider==='dodopayments'&&!paymentMetadata(notice).subscription_id&&!paymentMetadata(notice).tip_id&&!paymentMetadata(notice).ticket_id){
    const remoteId=data.subscription_id??(Array.isArray(data.subscription_ids)&&data.subscription_ids.length===1?data.subscription_ids[0]:null);
    if(typeof remoteId==='string'){
      const {data:subscription,error}=await createServiceClient().from('subscriptions').select('id,user_id').eq('provider',provider).eq('provider_subscription_id',remoteId).maybeSingle();
      if(error||!subscription)throw new Error('Subscription binding unavailable');
      notice.data.metadata={subscription_id:subscription.id,user_id:subscription.user_id};
    }
  }
  const event=normalizeTicket(notice)??normalizeTip(notice)??normalizeSubscription(notice);
  if(!event)throw new Error('Captured payment target unavailable');
  return event;
}

export async function drainRefundReconciliation(correlationId:string) {
  const client=createServiceClient();
  const {data,error}=await client.rpc('claim_refund_reconciliation' as never,{p_limit:3} as never);
  if(error)throw new Error('Refund queue unavailable');
  const events=refunds.parse(data);let completed=0;
  await Promise.all(events.map(async event=>{
    const requestId=event.correlation_id??correlationId;
    try{
      const {data:capture,error:lookupError}=await client.from('payment_captures').select('payment_id').eq('provider',event.provider).eq('payment_id',event.payment_id).maybeSingle();
      if(lookupError)throw new Error('Payment capture lookup unavailable');
      const payment=capture?null:await fetchCapturedPayment(event.provider,event.payment_id);
      const {data:applied,error:refundError}=await client.rpc((payment?'reconcile_capture_and_refund':'process_refund_event') as never,{p_provider:event.provider,p_refund_id:event.refund_id,p_payment_id:event.payment_id,p_amount_minor:event.amount_minor,p_currency:event.currency,p_correlation_id:requestId,...(payment?{p_event_id:payment.eventId,p_payload:payment.payload}:{})} as never);
      if(refundError||typeof applied!=='boolean')throw new Error('Refund reconciliation unavailable');
      completed++;
    }catch{
      await observeOperationalSignal('paymentFailures',requestId);
      const {error:retryError}=await client.from('refund_inbox').update({status:event.attempts>=10?'failed':'pending',claimed_at:null,next_attempt_at:new Date(Date.now()+Math.min(3600,30*2**event.attempts)*1000).toISOString()}).eq('provider',event.provider).eq('refund_id',event.refund_id).eq('status','processing').eq('attempts',event.attempts);
      recordMetric('refund_reconciliation_pending',{provider:event.provider,correlationId:requestId,attempt:event.attempts},'warn');
      if(retryError)throw new Error('Refund retry persistence unavailable');
    }
  }));
  return {scanned:events.length,completed,failed:events.length-completed};
}
