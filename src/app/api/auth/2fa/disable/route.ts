import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { currentFactorSessionHash, factorHash, factorProfile, factorSessionResponse, verifyFactorProof } from '@/lib/auth/second-factor';

export const dynamic='force-dynamic';
const schema=z.object({code:z.string().regex(/^\d{6}$/).optional(),recoveryCode:z.string().regex(/^[a-fA-F0-9]{5}-?[a-fA-F0-9]{5}$/).optional()}).refine(value=>!!value.code!==!!value.recoveryCode);
export async function POST(request:Request) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!(await checkCriticalRateLimit(getClientIp(request))).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  const key=request.headers.get('idempotency-key');if(!key||key.length<8||key.length>200)return NextResponse.json({error:'Invalid request key'},{status:400});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid verification request'},{status:400});
  const fingerprint=factorHash(JSON.stringify(parsed.data));
  try{
    const {data:previous,error:lookupError}=await createServiceClient().from('content_intents').select('fingerprint').eq('actor_id',user.id).eq('action','auth:disable_factor').eq('intent_key',key).maybeSingle();
    if(lookupError)throw new Error('Request lookup unavailable');
    if(previous)return previous.fingerprint===fingerprint?factorSessionResponse({ok:true}):NextResponse.json({error:'Conflicting request key'},{status:409});
    const profile=await factorProfile(user.id);if(!profile?.totp_enabled)return NextResponse.json({error:'2FA is not enabled'},{status:409});
    const proof=await verifyFactorProof(profile,parsed.data);if(!proof)return NextResponse.json({error:'Invalid verification code'},{status:422});
    const {error}=await createServiceClient().rpc('disable_factor_atomic',{p_user_id:user.id,p_version:profile.mfa_version,p_step:proof.step,p_recovery_hash:proof.recoveryHash,p_session_hash:await currentFactorSessionHash(user.id),p_key:key,p_fingerprint:fingerprint});
    if(error)return NextResponse.json({error:'Code already used or factor state changed'},{status:['P1001','P1003'].includes(error.code)?409:503});
    return factorSessionResponse({ok:true});
  }catch{return NextResponse.json({error:'Factor update unavailable'},{status:503});}
}
