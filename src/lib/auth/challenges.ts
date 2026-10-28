import {z} from 'zod';
import {getClientIp} from '@/lib/utils';

export const credentialEmail=z.string().trim().email().max(254).toLowerCase();
export const credentialPassword=z.string().min(1).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72);
export class AuthChallengeError extends Error{
  constructor(public readonly code:'CAPTCHA_REQUIRED'|'CAPTCHA_INVALID'|'CAPTCHA_UNAVAILABLE',public readonly status:number){super(code);}
}
export function authChallengeConfig(){
  return {enabled:!!process.env.HCAPTCHA_SECRET_KEY,siteKey:process.env.HCAPTCHA_SITE_KEY?.trim()||null};
}
export async function verifyAuthChallenge(token:string|undefined,request:Request){
  const config=authChallengeConfig(),secret=process.env.HCAPTCHA_SECRET_KEY;
  if(!config.enabled)return;
  if(!config.siteKey||!secret)throw new AuthChallengeError('CAPTCHA_UNAVAILABLE',503);
  if(!token)throw new AuthChallengeError('CAPTCHA_REQUIRED',400);
  if(token.length>8192)throw new AuthChallengeError('CAPTCHA_INVALID',422);
  const body=new URLSearchParams({secret,response:token,sitekey:config.siteKey}),ip=getClientIp(request);if(ip!=='unknown')body.set('remoteip',ip);
  let response:Response;
  try{response=await fetch('https://api.hcaptcha.com/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store',signal:AbortSignal.timeout(6000)});}catch{throw new AuthChallengeError('CAPTCHA_UNAVAILABLE',503);}
  if(!response.ok)throw new AuthChallengeError('CAPTCHA_UNAVAILABLE',503);
  const result=await response.json().catch(()=>null) as {success?:unknown;hostname?:unknown;'error-codes'?:unknown}|null;
  if(!result||typeof result.success!=='boolean')throw new AuthChallengeError('CAPTCHA_UNAVAILABLE',503);
  if(Array.isArray(result['error-codes'])&&result['error-codes'].some(code=>['invalid-input-secret','missing-input-secret','sitekey-secret-mismatch'].includes(code)))throw new AuthChallengeError('CAPTCHA_UNAVAILABLE',503);
  const canonical=new URL(process.env.NEXT_PUBLIC_APP_URL??'https://liravo.org').hostname;
  const hosts=(process.env.HCAPTCHA_ALLOWED_HOSTNAMES??canonical).split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!hosts.length)throw new AuthChallengeError('CAPTCHA_UNAVAILABLE',503);
  if(!result.success||typeof result.hostname!=='string'||!hosts.includes(result.hostname.toLowerCase()))throw new AuthChallengeError('CAPTCHA_INVALID',422);
}
