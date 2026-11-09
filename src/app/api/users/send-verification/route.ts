import {createServiceClient} from '@/lib/supabase/server';
import {sendEmail,buildVerificationEmail} from '@/lib/email';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {verifyAccountPin,PinError} from '@/lib/account-pin';
import {factorToken} from '@/lib/auth/second-factor';
import {discardEmailProof,emailHash,emailLink,emailRequest,emailResponse} from '@/lib/auth/email-links';

export const dynamic='force-dynamic';
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return emailResponse({error:'Unauthorized'},401);
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return emailResponse({error:'ACCOUNT_CHANGED'},409);
  const raw=await request.text();if(raw.length>1000)return emailResponse({error:'Payload too large'},413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return emailResponse({error:'Invalid JSON'},400);}
  const parsed=emailRequest.safeParse(body);if(!parsed.success)return emailResponse({error:'Invalid email request'},422);
  try{
    const pinHash=await verifyAccountPin(user.id,parsed.data.pin,request);
    const service=createServiceClient(),token=factorToken(),hash=emailHash(token);
    const {data:profile,error:profileError}=await service.from('users').select('display_name,username,preferred_locale').eq('id',user.id).single();
    if(profileError||!profile)throw new Error('Profile unavailable');
    const {data,error}=await service.rpc('issue_email_challenge',{p_user_id:user.id,p_email:parsed.data.email,p_purpose:'verify',p_hash:hash,p_pin_hash:pinHash});
    if(error)return emailResponse({error:error.code==='P1001'?'EMAIL_OR_PIN_CHANGED':'EMAIL_UNAVAILABLE'},error.code==='P1001'?409:503);
    if(!data)return emailResponse({error:'Account unavailable'},403);
    const message=buildVerificationEmail(profile.display_name??profile.username,emailLink('verify',token),profile.preferred_locale);
    const sent=await sendEmail({to:parsed.data.email,type:'email_verification',isPaidUser:false,...message});
    if(!sent.ok){await discardEmailProof(hash);return emailResponse({error:'EMAIL_DELIVERY_FAILED'},503);}
    return emailResponse({ok:true});
  }catch(error){return error instanceof PinError?emailResponse({error:error.code},error.status):emailResponse({error:'EMAIL_UNAVAILABLE'},503);}
}
