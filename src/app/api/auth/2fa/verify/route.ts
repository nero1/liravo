import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCriticalRateLimit, checkRouteRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { clientUser } from '@/lib/user-profile';
import { claimFactorChallenge, encryptFactor, factorHash, factorProfile, factorSessionResponse, factorSessionToken, verifyFactorProof } from '@/lib/auth/second-factor';

export const dynamic='force-dynamic';
const schema=z.object({challengeToken:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().regex(/^\d{6}$/).optional(),recoveryCode:z.string().regex(/^[a-fA-F0-9]{5}-?[a-fA-F0-9]{5}$/).optional()}).refine(value=>!!value.code!==!!value.recoveryCode);

export async function POST(request:Request) {
  if(!(await checkCriticalRateLimit(getClientIp(request))).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid verification request'},{status:400});
  try{
    const challenge=await claimFactorChallenge(parsed.data.challengeToken,'login');
    if(!challenge)return NextResponse.json({error:'Challenge expired or unavailable'},{status:401});
    if(!await checkRouteRateLimit(challenge.user_id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
    const profile=await factorProfile(challenge.user_id);if(!profile)return NextResponse.json({error:'Account unavailable'},{status:401});
    const proof=challenge.verified_at?{step:null,recoveryHash:null}:await verifyFactorProof(profile,parsed.data);
    if(!proof)return NextResponse.json({error:'Invalid verification code'},{status:422});
    const token=challenge.provider_session_hash?undefined:factorSessionToken(parsed.data.challengeToken);
    const {error}=await createServiceClient().rpc('finish_factor_challenge' as never,{
      p_hash:factorHash(parsed.data.challengeToken),p_kind:'login',p_version:challenge.expected_version,p_step:proof.step,p_recovery_hash:proof.recoveryHash,
      p_grant_hash:challenge.provider_session_hash??factorHash(token!),
      p_secret:profile.totp_secret&&!profile.totp_secret.startsWith('v1:')&&process.env.AUTH_ENCRYPTION_KEY?encryptFactor(profile.totp_secret):null,
    } as never);
    if(error)return NextResponse.json({error:'Code already used or challenge changed'},{status:['P1001','P1003'].includes(error.code)?409:503});
    const {data:user,error:userError}=await createServiceClient().from('users').select('*').eq('id',profile.id).single();
    if(userError)throw new Error('Profile unavailable');
    return factorSessionResponse({ok:true,...(token?{token}:{}),user:clientUser(user)},token,200,request);
  }catch{return NextResponse.json({error:'Verification unavailable'},{status:503});}
}
