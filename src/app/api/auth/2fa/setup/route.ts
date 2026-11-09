import { NextResponse } from 'next/server';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { claimFactorChallenge, currentFactorSessionHash, decryptFactor, encryptFactor, factorHash, factorSessionResponse, factorToken } from '@/lib/auth/second-factor';
import {PinError,verifyAccountPin} from '@/lib/account-pin';

export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('start')}),
  z.object({action:z.literal('confirm'),enrollmentToken:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().regex(/^\d{6}$/),pin:z.string().regex(/^\d{4}$/).optional()}),
]);

export async function POST(request:Request) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!(await checkCriticalRateLimit(getClientIp(request))).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid enrollment request'},{status:400});
  try{
    const sessionHash=await currentFactorSessionHash(user.id);
    if(parsed.data.action==='start'){
      const secret=generateSecret(),enrollmentToken=factorToken();
      const recoveryCodes=Array.from({length:8},()=>factorToken().slice(0,10).toUpperCase().replace(/^(.{5})/,'$1-'));
      const encrypted=encryptFactor(JSON.stringify({secret,recoveryCodes}));
      const {error}=await createServiceClient().rpc('begin_factor_challenge',{p_user_id:user.id,p_hash:factorHash(enrollmentToken),p_kind:'setup',p_session_hash:sessionHash,p_encrypted_payload:encrypted});
      if(error)return NextResponse.json({error:'Enrollment unavailable'},{status:error.code==='P1001'?409:503});
      const qrDataUrl=await QRCode.toDataURL(generateURI({label:user.email||user.id,issuer:'Liravo',secret}));
      return factorSessionResponse({secret,qrDataUrl,enrollmentToken});
    }
    const pinHash=await verifyAccountPin(user.id,parsed.data.pin,request);
    const challenge=await claimFactorChallenge(parsed.data.enrollmentToken,'setup');
    if(!challenge||challenge.user_id!==user.id||challenge.provider_session_hash!==sessionHash||!challenge.encrypted_payload)return NextResponse.json({error:'Enrollment expired or unavailable'},{status:401});
    const payload=JSON.parse(decryptFactor(challenge.encrypted_payload)) as {secret:string;recoveryCodes:string[]};
    const result=verifySync({token:parsed.data.code,secret:payload.secret,epochTolerance:30});
    if(!challenge.verified_at&&!result.valid)return NextResponse.json({error:'Invalid verification code'},{status:422});
    const step=result.valid&&'timeStep'in result&&typeof result.timeStep==='number'?result.timeStep:null;
    const hashes=await Promise.all(payload.recoveryCodes.map(code=>bcrypt.hash(code,10)));
    const {error}=await createServiceClient().rpc('finish_factor_challenge',{p_hash:factorHash(parsed.data.enrollmentToken),p_kind:'setup',p_version:challenge.expected_version,p_step:step,p_recovery_hash:null,p_grant_hash:sessionHash,p_secret:encryptFactor(payload.secret),p_recovery_hashes:hashes,p_pin_hash:pinHash});
    if(error)return NextResponse.json({error:'Enrollment changed; restart setup'},{status:['P1001','P1003'].includes(error.code)?409:503});
    return factorSessionResponse({ok:true,recoveryCodes:payload.recoveryCodes});
  }catch(error){return error instanceof PinError?NextResponse.json({error:error.code},{status:error.status}):NextResponse.json({error:'Enrollment unavailable'},{status:503});}
}
