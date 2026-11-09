import {createServiceClient} from '@/lib/supabase/server';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {getClientIp} from '@/lib/utils';
import {emailHash,emailLanding,emailProof,emailResponse} from '@/lib/auth/email-links';

export const dynamic='force-dynamic';
export function GET(request:Request){return emailLanding(request,'verify');}
export async function POST(request:Request){
  if(!(await checkCriticalRateLimit('email-proof:ip:'+getClientIp(request))).allowed)return emailResponse({error:'Too many requests'},429);
  const raw=await request.text();if(raw.length>200)return emailResponse({error:'Payload too large'},413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return emailResponse({error:'Invalid JSON'},400);}
  const parsed=emailProof.safeParse(body);if(!parsed.success)return emailResponse({error:'INVALID_EMAIL_LINK'},422);
  try{
    const {data,error}=await createServiceClient().rpc('consume_email_challenge',{p_hash:emailHash(parsed.data.token),p_purpose:'verify'});
    if(error)return emailResponse({error:error.code==='P1001'||error.code==='23505'?'EMAIL_UNAVAILABLE':'EMAIL_CONFIRMATION_UNAVAILABLE'},['P1001','23505'].includes(error.code)?409:503);
    return data?emailResponse({ok:true}):emailResponse({error:'INVALID_EMAIL_LINK'},410);
  }catch{return emailResponse({error:'EMAIL_CONFIRMATION_UNAVAILABLE'},503);}
}
