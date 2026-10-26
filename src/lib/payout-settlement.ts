import Decimal from 'decimal.js';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { observeOperationalSignal } from '@/lib/operational-alerts';
import { recordMetric } from '@/lib/metrics';

const payoutSchema=z.object({id:z.string().uuid(),amount:z.union([z.string(),z.number()]),currency:z.literal('NGN'),method:z.literal('paystack'),transfer_reference:z.string(),provider_recipient_code:z.string().nullable(),attempts:z.number().int(),destination:z.object({display_name:z.string(),account_number:z.string(),bank_code:z.string(),currency:z.literal('NGN')})});
type Payout=z.infer<typeof payoutSchema>;
class PendingTransfer extends Error {}
async function paystack(path:string,body?:unknown) {
  const secret=process.env.PAYSTACK_SECRET_KEY;
  if(!secret) throw new Error('Payout provider unavailable');
  const response=await fetch(`https://api.paystack.co${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(6_000)});
  if(!body && response.status===404) return null;
  if(!response.ok) throw new Error('Payout provider unavailable');
  const result=z.object({status:z.literal(true),data:z.unknown()}).parse(await response.json());
  return result.data;
}
async function verifyTransfer(payout:Payout,recipient:string) {
  const result=await paystack(`/transfer/verify/${encodeURIComponent(payout.transfer_reference)}`);
  if(result===null) return null;
  const transfer=z.object({reference:z.string(),amount:z.number().int(),currency:z.string(),status:z.string(),transfer_code:z.string(),recipient:z.object({recipient_code:z.string()})}).parse(result);
  if(transfer.reference!==payout.transfer_reference || transfer.currency!==payout.currency || !new Decimal(transfer.amount).equals(new Decimal(payout.amount).times(100)) || transfer.recipient.recipient_code!==recipient) throw new Error('Transfer binding mismatch');
  return transfer;
}
export async function processPayout(payoutId:string,actorId:string|null,correlationId:string) {
  const client=createServiceClient();
  const {data,error}=await client.rpc('claim_payout_request' as never,{p_actor_id:actorId,p_payout_id:payoutId,p_correlation_id:correlationId} as never);
  if(error) throw Object.assign(new Error('Payout claim unavailable'),{code:error.code});
  const claim=z.object({claimed:z.boolean(),status:z.string()}).parse(data);
  if(!claim.claimed) return {processed:claim.status==='completed',status:claim.status,pending:['pending','processing'].includes(claim.status)};
  if((data as {method?:string}).method==='manual')return {processed:false,status:'processing',pending:true};
  const payout=payoutSchema.parse(data);
  try {
    let recipient=payout.provider_recipient_code;
    if(!recipient) {
      const created=z.object({recipient_code:z.string().min(1)}).parse(await paystack('/transferrecipient',{type:'nuban',name:payout.destination.display_name,account_number:payout.destination.account_number,bank_code:payout.destination.bank_code,currency:payout.currency}));
      recipient=created.recipient_code;
      const {data:saved,error:saveError}=await client.from('payout_requests').update({provider_recipient_code:recipient}).eq('id',payout.id).eq('attempts',payout.attempts).select('id').single();
      if(saveError || !saved) throw new Error('Payout recipient persistence unavailable');
    }
    let transfer=await verifyTransfer(payout,recipient);
    if(!transfer) {
      await paystack('/transfer',{source:'balance',currency:payout.currency,amount:new Decimal(payout.amount).times(100).toNumber(),recipient,reason:'Liravo creator earnings payout',reference:payout.transfer_reference});
      transfer=await verifyTransfer(payout,recipient);
    }
    if(!transfer) throw new Error('Transfer confirmation pending');
    const status=transfer.status==='success'?'completed':['failed','reversed'].includes(transfer.status)?transfer.status:null;
    if(status) {
      const {error:settleError}=await client.rpc('settle_payout_request' as never,{p_actor_id:actorId,p_payout_id:payout.id,p_status:status,p_reference:transfer.reference,p_amount:new Decimal(payout.amount).toFixed(2),p_currency:payout.currency,p_provider_code:transfer.transfer_code,p_correlation_id:correlationId} as never);
      if(settleError) throw new Error('Payout settlement unavailable');
      return {processed:status==='completed',status:status==='reversed'?'failed':status,pending:false};
    }
    throw new PendingTransfer('Transfer awaiting provider confirmation');
  }catch(error) {
    if(!(error instanceof PendingTransfer)||payout.attempts>=10)await observeOperationalSignal('payoutFailures',correlationId);
    const {error:retryError}=await client.rpc('defer_payout_request' as never,{p_payout_id:payout.id,p_attempt:payout.attempts,p_error:'Transfer confirmation pending; reservation retained'} as never);
    recordMetric('payout_confirmation_pending',{payoutId:payout.id,correlationId,attempt:payout.attempts},'warn');
    if(retryError) throw new Error('Payout retry persistence unavailable');
    return {processed:false,status:'processing',pending:true};
  }
}
export async function drainPayoutSettlements(correlationId:string) {
  const {data,error}=await createServiceClient().from('payout_requests').select('id').eq('method','paystack').eq('status','processing').lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at',{ascending:true}).limit(3);
  if(error || !Array.isArray(data)) throw new Error('Payout queue unavailable');
  return Promise.all(data.map(row=>processPayout(row.id,null,correlationId)));
}
