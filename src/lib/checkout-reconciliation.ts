import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { dodoConnection } from '@/lib/payment-providers';
import { capturedPaymentEvent,fetchCapturedPayment } from '@/lib/refund-reconciliation';
import { observeOperationalSignal } from '@/lib/operational-alerts';
import { recordMetric } from '@/lib/metrics';

const jobs=z.array(z.object({entity_type:z.enum(['tip','subscription','ticket']),entity_id:z.string().uuid(),user_id:z.string().uuid(),provider:z.enum(['paystack','dodopayments']),reference:z.string().min(1).max(200),attempts:z.number().int().positive(),claim_token:z.string().uuid(),scan_page:z.number().int().nonnegative()}));
type CheckoutJob=z.infer<typeof jobs>[number];
function mismatch(){return Object.assign(new Error('Payment binding mismatch'),{code:'P1003'});}
async function applyPayment(job:CheckoutJob,event:Awaited<ReturnType<typeof fetchCapturedPayment>>,correlationId:string){
  const payload=event.payload as {tipId?:string;subscription_id?:string;ticket_id?:string;user_id?:string};
  if((job.entity_type==='tip'?payload.tipId:job.entity_type==='ticket'?payload.ticket_id:payload.subscription_id)!==job.entity_id||job.entity_type!=='tip'&&payload.user_id!==job.user_id)throw mismatch();
  const {data,error}=await createServiceClient().rpc('process_payment_event',{p_provider:job.provider,p_event_id:event.eventId,p_payload:event.payload,p_correlation_id:correlationId});
  if(error)throw Object.assign(new Error('Payment reconciliation failed'),{code:error.code});
  if(typeof data!=='boolean')throw new Error('Payment reconciliation acknowledgement missing');
  return data;
}
async function lookup(job:CheckoutJob,correlationId:string){
  const {data:entity,error}=await createServiceClient().from(job.entity_type==='tip'?'tips':job.entity_type==='ticket'?'event_tickets':'subscriptions').select('*').eq('id',job.entity_id).maybeSingle();
  if(error||!entity)throw new Error('Checkout unavailable');
  if(entity.user_id!==job.user_id||job.provider!==(job.entity_type==='tip'?(entity.currency==='NGN'?'paystack':'dodopayments'):('provider'in entity?entity.provider:null)))throw mismatch();
  if(job.provider==='paystack'){
    const key=process.env.PAYSTACK_SECRET_KEY;if(!key)throw new Error('Paystack unavailable');
    const response=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(job.reference)}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(6000)});
    if(response.status===404&&!entity.checkout_url)return {settled:Date.now()-new Date(entity.created_at).getTime()>7*86400000,page:0,delay:3600,applied:0};
    if(!response.ok)throw new Error('Paystack verification unavailable');
    const result=await response.json();
    if(result.status!==true||result.data?.reference!==job.reference)throw mismatch();
    if(result.data.status!=='success')return {settled:false,page:0,delay:60,applied:0};
    const event=await capturedPaymentEvent('paystack',result.data);
    return {settled:true,page:0,delay:300,applied:Number(await applyPayment(job,event,correlationId))};
  }
  const connection=dodoConnection(),headers={Authorization:`Bearer ${connection.key}`};
  if(job.entity_type==='subscription'&&('provider_subscription_id'in entity?entity.provider_subscription_id:null)){
    const url=new URL(connection.base+'/payments');
    url.searchParams.set('subscription_id',String('provider_subscription_id'in entity?entity.provider_subscription_id:''));url.searchParams.set('status','succeeded');
    url.searchParams.set('page_size','3');url.searchParams.set('page_number',String(job.scan_page));
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new Error('Renewal lookup unavailable');
    const list=z.object({items:z.array(z.object({payment_id:z.string().min(1).max(150)})).max(3)}).parse(await response.json());
    const applied=await Promise.all(list.items.map(async item=>applyPayment(job,await fetchCapturedPayment('dodopayments',item.payment_id),correlationId)));
    const more=list.items.length===3;
    return {settled:!more&&'renewal_cancelled'in entity&&entity.renewal_cancelled===true,page:more?job.scan_page+1:0,delay:more?60:21600,applied:applied.filter(Boolean).length};
  }
  if(!entity.provider_checkout_id){
    if(entity.checkout_url)throw new Error('Legacy checkout requires a verified session identity');
    return {settled:Date.now()-new Date(entity.created_at).getTime()>7*86400000,page:0,delay:3600,applied:0};
  }
  const response=await fetch(`${connection.base}/checkouts/${encodeURIComponent(entity.provider_checkout_id)}`,{headers,signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error('Checkout lookup unavailable');
  const session=z.object({id:z.string(),payment_id:z.string().nullable().optional(),payment_status:z.string().nullable().optional()}).parse(await response.json());
  if(session.id!==entity.provider_checkout_id)throw mismatch();
  if(session.payment_status!=='succeeded'||!session.payment_id)return {settled:false,page:0,delay:60,applied:0};
  const event=await fetchCapturedPayment('dodopayments',session.payment_id);
  return {settled:job.entity_type!=='subscription',page:0,delay:300,applied:Number(await applyPayment(job,event,correlationId))};
}
export async function drainCheckoutReconciliation(correlationId:string,userId?:string){
  const client=createServiceClient();
  const {data,error}=await client.rpc('claim_checkout_reconciliations',{p_user_id:userId??null,p_limit:3});
  if(error)throw new Error('Checkout queue unavailable');
  const claimed=jobs.parse(data);let applied=0,failed=0;
  await Promise.all(claimed.map(async job=>{
    let outcome;
    try{outcome=await lookup(job,correlationId);applied+=outcome.applied;}catch(error){
      failed++;
      const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';
      const reason=code==='P1003'?'BINDING_MISMATCH':code==='P1002'?'AMOUNT_MISMATCH':'DEPENDENCY_FAILURE';
      await observeOperationalSignal('paymentFailures',correlationId);
      recordMetric('checkout_reconciliation_pending',{provider:job.provider,correlationId,attempt:job.attempts,reason},'warn');
      const {error:retryError}=await client.rpc('finish_checkout_reconciliation',{p_kind:job.entity_type,p_entity_id:job.entity_id,p_claim:job.claim_token,p_ok:false,p_settled:false,p_page:job.scan_page,p_delay:Math.min(21600,30*2**Math.min(job.attempts,10)),p_error:reason,p_correlation_id:correlationId});
      if(retryError)throw new Error('Checkout retry persistence unavailable');
      return;
    }
    const {error:finishError}=await client.rpc('finish_checkout_reconciliation',{p_kind:job.entity_type,p_entity_id:job.entity_id,p_claim:job.claim_token,p_ok:true,p_settled:outcome.settled,p_page:outcome.page,p_delay:outcome.delay,p_error:null,p_correlation_id:correlationId});
    if(finishError)throw new Error('Checkout completion unavailable');
  }));
  return {scanned:claimed.length,applied,failed};
}
