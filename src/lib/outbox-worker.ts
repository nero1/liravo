import { checkAndAwardBadges } from '@/services/badges';
import { sendPushToUser } from '@/lib/push-notifications';
import { createServiceClient } from '@/lib/supabase/server';
import { recordMetric } from '@/lib/metrics';
import {classifyTone} from '@/lib/tone-classifier';

const MAX_ATTEMPTS = 10;

type OutboxEventRow = {
  id: string;
  aggregate_type?:string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function nextDelaySeconds(attempts: number): number {
  const capped = Math.min(attempts, 8);
  const base = 2 ** capped;
  const jitter = Math.floor(Math.random() * 5);
  return base + jitter;
}

async function completeClaim(event:OutboxEventRow){
 const {data,error}=await createServiceClient().from('outbox_events').update({status:'processed',processed_at:new Date().toISOString(),last_error:null}).eq('id',event.id).eq('status','processing').eq('attempts',event.attempts).select('id').maybeSingle();
 if(error||!data||data.id!==event.id)throw new Error('Outbox completion unavailable');
}
async function processEvent(event:OutboxEventRow){
 const service=createServiceClient();
 if(event.event_type==='moderate_review'){
  const {data:review,error}=await service.from('reviews').select('id,content,moderation_status').eq('id',String(event.payload.reviewId)).maybeSingle();if(error)throw new Error('Review unavailable');if(!review){await completeClaim(event);return;}
  const tone=review.moderation_status==='pending'?await classifyTone(String(review.content)):'neutral';if(tone==='unavailable')throw new Error('Review moderation unavailable');
  const {data,error:finishError}=await service.rpc('finish_review_moderation' as never,{p_review:review.id,p_status:tone==='toxic'?'removed':'published',p_event:event.id,p_attempt:event.attempts} as never);if(finishError||!data)throw new Error('Review moderation persistence unavailable');
  return;
 }
 if(event.event_type==='deliver_push'){
  const payload=event.payload,type=payload.sourceEventType==='notify_recipient'?'tip':typeof payload.notificationType==='string'?payload.notificationType:payload.sourceAggregateType==='follow'||payload.title==='New Follower'?'follow':undefined;
  await sendPushToUser(String(payload.userId),{
   title:String(payload.title??'New tip'),body:String(payload.body??('You received a '+(payload.currency??'USD')+' '+payload.amount+' tip!')),url:String(payload.url??'/notifications'),tag:'outbox:'+event.aggregate_type+':'+event.id,notificationType:type,
   messageKey:type==='tip'?'tipAmount':type==='follow'?'follow':undefined,messageValues:type==='tip'?{amount:payload.amount,currency:payload.currency??'USD'}:{},
  },{delivered:Array.isArray(payload.deliveryReceipts)?payload.deliveryReceipts.filter((id):id is string=>typeof id==='string'):[],ack:async id=>{
   const {data,error}=await service.rpc('ack_push_delivery' as never,{p_event:event.id,p_attempt:event.attempts,p_subscription:id} as never);if(error||data!==true)throw new Error('Push acknowledgement unavailable');
  }});
  await completeClaim(event);
  return;
 }
 if(event.event_type==='check_badges')await checkAndAwardBadges(String(event.payload.userId),String(event.payload.trigger));
 const {error}=await service.rpc('process_outbox_event_atomic' as never,{p_event_id:event.id} as never);if(error)throw new Error('Outbox processing unavailable');
}

export async function drainOutbox(batchSize=50){
 const service=createServiceClient(),limit=Math.min(200,Math.max(1,Math.floor(batchSize))),deadline=Date.now()+25000;
 let processed=0,failed=0,scanned=0;
 while(scanned<limit&&Date.now()<deadline){
  const {data,error}=await service.rpc('claim_outbox_events' as never,{p_batch_size:Math.min(3,limit-scanned)} as never);if(error)throw new Error('Outbox claim unavailable');
  const events=(data??[])as OutboxEventRow[];if(!events.length)break;scanned+=events.length;
  await Promise.all(events.map(async event=>{
   try{await processEvent(event);processed++;}
   catch(error){
    failed++;const terminal=event.attempts>=MAX_ATTEMPTS;
    const {error:retryError}=await service.from('outbox_events').update({status:terminal?'failed':'pending',last_error:error instanceof Error?error.message:String(error),next_attempt_at:new Date(Date.now()+(terminal?0:nextDelaySeconds(event.attempts)*1000)).toISOString()}).eq('id',event.id).eq('status','processing').eq('attempts',event.attempts);
    if(retryError)throw new Error('Outbox retry persistence unavailable');
   }
  }));
 }
 recordMetric('outbox_drain_run',{processed,failed,scanned,batchSize});return {processed,failed,scanned};
}
