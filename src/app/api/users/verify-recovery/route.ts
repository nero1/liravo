import {createServiceClient} from '@/lib/supabase/server';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {getClientIp} from '@/lib/utils';
import {emailHash,emailLanding,emailProof,emailResponse,recoverySession} from '@/lib/auth/email-links';

export const dynamic='force-dynamic';
export function GET(request:Request){return emailLanding(request,'recover');}
export async function POST(request:Request){
  if(!(await checkCriticalRateLimit('email-proof:ip:'+getClientIp(request))).allowed)return emailResponse({error:'Too many requests'},429);
  const raw=await request.text();if(raw.length>200)return emailResponse({error:'Payload too large'},413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return emailResponse({error:'Invalid JSON'},400);}
  const parsed=emailProof.safeParse(body);if(!parsed.success)return emailResponse({error:'INVALID_EMAIL_LINK'},422);
  try{
    const {data,error}=await createServiceClient().rpc('consume_email_challenge' as never,{p_hash:emailHash(parsed.data.token),p_purpose:'recover'} as never);
    if(error)throw new Error('Recovery unavailable');
    if(!data)return emailResponse({error:'INVALID_EMAIL_LINK'},410);
    return await recoverySession(data as unknown as {id:string;email:string},request);
  }catch{return emailResponse({error:'RECOVERY_UNAVAILABLE'},503);}
}
