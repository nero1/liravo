import {createServiceClient} from '@/lib/supabase/server';
import {sendEmail,buildRecoveryEmail} from '@/lib/email';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {getClientIp} from '@/lib/utils';
import {factorToken} from '@/lib/auth/second-factor';
import {discardEmailProof,emailHash,emailLink,emailRequest,emailResponse} from '@/lib/auth/email-links';
import {recordMetric} from '@/lib/metrics';

export const dynamic='force-dynamic';
export async function POST(request:Request){
  if(!(await checkCriticalRateLimit('recovery:ip:'+getClientIp(request))).allowed)return emailResponse({error:'Too many requests'},429);
  const raw=await request.text();if(raw.length>500)return emailResponse({error:'Payload too large'},413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return emailResponse({error:'Invalid JSON'},400);}
  const parsed=emailRequest.omit({pin:true}).safeParse(body);if(!parsed.success)return emailResponse({error:'Invalid email request'},422);
  if(!(await checkCriticalRateLimit('recovery:address:'+emailHash(parsed.data.email))).allowed)return emailResponse({error:'Too many requests'},429);
  try{
    const service=createServiceClient(),token=factorToken(),hash=emailHash(token);
    const {data,error}=await service.rpc('issue_account_recovery' as never,{p_email:parsed.data.email,p_hash:hash} as never);
    if(error)throw new Error('Account lookup unavailable');
    const user=data as unknown as {id:string;display_name:string|null;username:string}|null;
    if(user){
      try{
        const sent=await sendEmail({to:parsed.data.email,type:'account_recovery',isPaidUser:false,...buildRecoveryEmail(user.display_name??user.username,emailLink('recover',token))});
        if(!sent.ok){await discardEmailProof(hash);recordMetric('account_recovery_delivery_failed',{userId:user.id},'error');}
      }catch{recordMetric('account_recovery_delivery_failed',{userId:user.id},'error');}
    }
    return emailResponse({ok:true,message:'If this address belongs to a verified account, a recovery link will arrive shortly.'},202);
  }catch{return emailResponse({error:'RECOVERY_UNAVAILABLE'},503);}
}
