import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { dodoConnection } from '@/lib/payment-providers';
import { z, ZodError } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { readPaymentNotice, normalizeSubscription, normalizeTip, normalizeTicket, normalizeRefund, paymentMetadata, type PaymentNotice } from '@/lib/payment-webhooks';
import { getRequestCorrelationId } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';
import { observeOperationalSignal } from '@/lib/operational-alerts';

async function settleTransfer(notice:PaymentNotice,correlationId:string) {
  if(notice.provider!=='paystack'||!['transfer.success','transfer.failed','transfer.reversed'].includes(notice.event))return null;
  const state=notice.event.slice('transfer.'.length);
  const transfer=z.object({reference:z.string().min(1).max(200),amount:z.number().int().positive(),currency:z.literal('NGN'),transfer_code:z.string().min(1),status:z.literal(state),recipient:z.object({recipient_code:z.string().min(1)})}).parse(notice.data);
  if(!transfer.reference.startsWith('liravo_payout_'))return NextResponse.json({received:true,ignored:true,correlationId});
  const client=createServiceClient();
  const {data:payout,error}=await client.from('payout_requests').select('id,provider_recipient_code').eq('method','paystack').eq('transfer_reference',transfer.reference).maybeSingle();
  if(error||!payout)throw new Error('Payout binding unavailable');
  if(payout.provider_recipient_code!==transfer.recipient.recipient_code)throw Object.assign(new Error('Transfer recipient mismatch'),{code:'P1003'});
  const {error:settleError}=await client.rpc('settle_payout_request' as never,{p_actor_id:null,p_payout_id:payout.id,p_status:state==='success'?'completed':state,p_reference:transfer.reference,p_amount:new Decimal(transfer.amount).div(100).toFixed(2),p_currency:transfer.currency,p_provider_code:transfer.transfer_code,p_correlation_id:correlationId} as never);
  if(settleError)throw Object.assign(new Error('Payout settlement failed'),{code:settleError.code});
  return NextResponse.json({received:true,correlationId});
}
export async function paymentWebhook(request:Request) {
  const correlationId=getRequestCorrelationId(request);
  const notice=await readPaymentNotice(request);
  if(notice instanceof NextResponse){notice.headers.set('x-request-id',correlationId);return notice;}
  await observeOperationalSignal('webhooks',correlationId);
  try {
    const transfer=await settleTransfer(notice,correlationId);if(transfer)return transfer;
    if(notice.provider==='dodopayments'&&notice.event==='refund.succeeded'&&(notice.data.amount==null||notice.data.currency==null)){
      const id=z.string().min(1).max(150).parse(notice.data.refund_id);const connection=dodoConnection();
      const response=await fetch(`${connection.base}/refunds/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${connection.key}`},signal:AbortSignal.timeout(6_000)});
      if(!response.ok)throw new Error('Refund lookup unavailable');
      const refund=await response.json();
      if(refund.refund_id!==id||(notice.data.payment_id!=null&&refund.payment_id!==notice.data.payment_id)||refund.amount==null||refund.currency==null)throw new Error('Refund currency or amount unavailable');
      notice.data=refund;
    }
    const refund=normalizeRefund(notice);
    if(refund){
      const {data,error}=await createServiceClient().rpc('process_refund_event' as never,{p_provider:notice.provider,p_refund_id:refund.refundId,p_payment_id:refund.paymentId,p_amount_minor:refund.amountMinor,p_currency:refund.currency,p_correlation_id:correlationId} as never);
      if(error)throw Object.assign(new Error('Refund reconciliation unavailable'),{code:error.code});
      if(data==null){await observeOperationalSignal('paymentFailures',correlationId);return NextResponse.json({error:'Captured payment pending reconciliation',code:'REFUND_CAPTURE_PENDING',correlationId},{status:503});}
      if(data===false)await observeOperationalSignal('webhookReplays',correlationId);
      return NextResponse.json({received:true,correlationId});
    }

    let event:ReturnType<typeof normalizeTip>|ReturnType<typeof normalizeSubscription>|ReturnType<typeof normalizeTicket>=normalizeTicket(notice)??normalizeTip(notice);
    if(!event){
      const remoteId=notice.data.subscription_id??(Array.isArray(notice.data.subscription_ids)&&notice.data.subscription_ids.length===1?notice.data.subscription_ids[0]:undefined);
      if(notice.provider==='dodopayments'&&(notice.event.startsWith('subscription.')||notice.event==='payment.succeeded')&&!paymentMetadata(notice).subscription_id&&typeof remoteId==='string'){
        const {data,error}=await createServiceClient().from('subscriptions').select('id,user_id').eq('provider',notice.provider).eq('provider_subscription_id',remoteId).maybeSingle();
        if(error)throw new Error('Subscription lookup failed');
        if(data)notice.data.metadata={subscription_id:data.id,user_id:data.user_id};
      }
      if(notice.provider==='dodopayments'&&notice.event==='payment.succeeded'&&paymentMetadata(notice).subscription_id&&!Array.isArray(notice.data.service_periods)){
        const id=z.string().min(1).max(150).parse(notice.data.payment_id);const connection=dodoConnection();
        const response=await fetch(`${connection.base}/payments/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${connection.key}`},signal:AbortSignal.timeout(6_000)});
        if(!response.ok)throw new Error('Payment service period unavailable');
        const payment=await response.json();
        if(payment.payment_id!==id||!Array.isArray(payment.service_periods))throw new Error('Payment service period unavailable');
        notice.data.service_periods=payment.service_periods;
      }
      event=normalizeSubscription(notice);
    }
    if(!event)return NextResponse.json({received:true,ignored:true,correlationId});
    const {data,error}=await createServiceClient().rpc('process_payment_event' as never,{p_provider:notice.provider,p_event_id:event.eventId,p_payload:event.payload,p_correlation_id:correlationId} as never);
    if(error)throw Object.assign(new Error('Payment processing failed'),{code:error.code});
    if(data===false){await observeOperationalSignal('webhookReplays',correlationId);recordMetric('payment_webhook_replay',{correlationId,provider:notice.provider,eventId:event.eventId});}
    return NextResponse.json({received:true,correlationId});
  }catch(error){
    const sqlCode=error instanceof Error&&'code' in error?String(error.code):'';
    const codes:Record<string,string>={P1001:'PAYMENT_EVENT_CONFLICT',P1002:'PAYMENT_AMOUNT_MISMATCH',P1003:'PAYMENT_BINDING_MISMATCH'};
    const code=codes[sqlCode]??'PAYMENT_DEPENDENCY_FAILURE';
    await observeOperationalSignal(sqlCode==='P1001'?'webhookConflicts':'paymentFailures',correlationId);
    recordMetric('payment_webhook_error',{correlationId,provider:notice.provider,event:notice.event,code},'error');
    return NextResponse.json({error:'Payment processing failed',code,correlationId},{status:sqlCode==='P1001'?409:codes[sqlCode]||error instanceof ZodError?400:503});
  }
}
