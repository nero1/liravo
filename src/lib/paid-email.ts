import type {RpcCall}from'@/types/database.generated';
import {createServiceClient} from '@/lib/supabase/server';
import {sendEmail,buildWeeklyDigestEmail,buildNewReleaseEmail} from '@/lib/email';
import {recordMetric} from '@/lib/metrics';
export interface PaidEmailClaim {userId:string;claimId:string;email:string;displayName:string;locale:string;unsubscribeToken:string;period?:string;postId?:string;username?:string;stats?:{newFollowers:number;newNotifications:number;booksThisWeek:number};authorName?:string;bookTitle?:string;bookId?:string;}
export async function emailRpc<T>(...[name,params]:RpcCall){const{data,error}=await createServiceClient().rpc(name,params);if(error)throw Error('Email storage unavailable');return data as T;}
export async function deliverPaidEmail(kind:'weekly_digest'|'new_release_alert',claim:PaidEmailClaim){
 let result,attempted=false;
 try{const message=kind==='weekly_digest'?buildWeeklyDigestEmail(claim.displayName,claim.username!,claim.stats!,claim.locale):buildNewReleaseEmail(claim.displayName,claim.authorName!,claim.bookTitle!,new URL('/book/'+claim.bookId,process.env.NEXT_PUBLIC_APP_URL??'https://liravo.org').toString(),claim.locale);
  attempted=true;result=await sendEmail({to:claim.email,type:kind,isPaidUser:true,...message,unsubscribeToken:claim.unsubscribeToken});
 }catch{result={ok:false,ambiguous:attempted};}
 const status=result.ok?'sent':result.ambiguous?'unknown':'failed';
 let confirmed=false;
 for(let attempt=0;attempt<2&&!confirmed;attempt++)try{confirmed=await emailRpc<boolean>('finish_paid_email',{p_kind:kind,p_user:claim.userId,p_claim:claim.claimId,p_status:status,p_message:result.messageId??null,p_period:claim.period??null,p_post:claim.postId??null});}catch{}
 if(!confirmed){recordMetric('email_delivery_uncertain',{userId:claim.userId,postId:claim.postId,period:claim.period},'error');return 'unknown';}
 if(status==='unknown')recordMetric('email_delivery_uncertain',{userId:claim.userId,postId:claim.postId,period:claim.period},'error');
 return status;
}

export async function processPaidEmails(kind:'weekly_digest'|'new_release_alert'){
 const deadline=Date.now()+35_000;await emailRpc<number>('cleanup_email_unsubscribe_proofs',{});const queued=await emailRpc<number>(kind==='weekly_digest'?'queue_paid_digest_audience':'queue_release_email_audience',{});if(typeof queued!=='number')throw Error('Email audience unavailable');
 const totals={sent:0,failed:0,unknown:0,skipped:0};let processed=0;
 while(processed<40&&Date.now()<deadline){const batch=await emailRpc<{claims:PaidEmailClaim[];examined:number}>(kind==='weekly_digest'?'claim_digest_email_batch':'claim_release_email_batch',{p_limit:Math.min(4,40-processed)});if(!batch||!Array.isArray(batch.claims)||!Number.isInteger(batch.examined)||batch.examined<batch.claims.length||batch.examined>Math.min(4,40-processed))throw Error('Email claims unavailable');if(!batch.examined)break;
  totals.skipped+=batch.examined-batch.claims.length;await Promise.all(batch.claims.map(async claim=>{const status=await deliverPaidEmail(kind,claim);totals[status]++;}));processed+=batch.examined;
 }
 return{queued,processed,...totals};
}
