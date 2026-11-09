import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { verifySync } from 'otplib';
import bcrypt from 'bcryptjs';
import { getRedisClient } from '@/lib/redis';
import { NextResponse } from 'next/server';
import { isStatelessNativeAuth } from '@/lib/csrf';

export interface FactorProfile {
  id:string;email:string|null;username:string;totp_enabled:boolean;totp_secret:string|null;recovery_codes:string[]|null;
  mfa_version:number;mfa_last_step:number|null;is_banned:boolean;deleted_at:string|null;auth_not_before?:number;
}
export interface FactorChallenge {
  user_id:string;kind:'login'|'setup';expected_version:number;provider_session_hash:string|null;encrypted_payload:string|null;verified_at:string|null;
}
export const factorHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const factorToken=()=>randomBytes(32).toString('hex');
export const factorSessionToken=(challengeToken:string)=>'mfa_'+factorHash('liravo:factor-session:'+challengeToken);
const service=async()=>(await import('@/lib/supabase/server')).createServiceClient();

function encryptionKey() {
  const key=Buffer.from(process.env.AUTH_ENCRYPTION_KEY??'','base64');
  if(key.length!==32)throw new Error('AUTH_ENCRYPTION_KEY must encode 32 bytes');
  return key;
}
export function encryptFactor(value:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join(':');
}
export function decryptFactor(value:string) {
  if(!value.startsWith('v1:'))return value;
  const [,iv,tag,encrypted]=value.split(':');
  if(!iv||!tag||!encrypted)throw new Error('Invalid encrypted factor');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64')),decipher.final()]).toString('utf8');
}
export async function factorProfile(userId:string):Promise<FactorProfile|null> {
  const {data,error}=await (await service()).from('users').select('id,email,username,totp_enabled,totp_secret,recovery_codes,mfa_version,mfa_last_step,is_banned,deleted_at,auth_not_before').eq('id',userId).maybeSingle();
  if(error)throw new Error('Authentication state unavailable');
  return data as unknown as FactorProfile|null;
}
export function providerSessionHash(userId:string,accessToken:string) {
  try{
    const claims=JSON.parse(Buffer.from(accessToken.split('.')[1],'base64url').toString('utf8')) as {sub?:string;session_id?:string};
    if(claims.sub!==userId||!claims.session_id)throw new Error('Invalid provider session');
    return factorHash(`supabase:${userId}:${claims.session_id}`);
  }catch{throw new Error('Provider session identity unavailable');}
}
async function readGrant(hash:string) {
  const {data,error}=await (await service()).rpc('read_factor_session',{p_hash:hash});
  if(error)throw new Error('Session proof unavailable');
  return data as {id:string;email:string;mfaVersion:number}|null;
}
export async function providerFactorAuthorized(userId:string,accessToken:string|undefined) {
  const profile=await factorProfile(userId);
  if(!profile||profile.is_banned||profile.deleted_at)return false;
  if(!providerTokenCurrent(accessToken,Number(profile.auth_not_before??0)))return false;
  if(!profile.totp_enabled)return true;
  if(!accessToken)return false;
  const grant=await readGrant(providerSessionHash(userId,accessToken));
  return grant?.id===userId;
}
export function providerTokenCurrent(token:string|undefined,notBefore:number){
  if(notBefore===0)return true;
  try{const claims=JSON.parse(Buffer.from(token!.split('.')[1],'base64url').toString('utf8'));return typeof claims.iat==='number'&&Number.isFinite(claims.iat)&&claims.iat>=notBefore;}catch{return false;}
}
export async function readDirectSession(token:string) {
  if(/^mfa_[a-f0-9]{64}$/.test(token))return readGrant(factorHash(token));
  const raw=await getRedisClient().get(`do:session:${token}`);if(!raw)return null;
  let session:{id:string;email:string;mfaVersion?:number};try{session=JSON.parse(raw);}catch{return null;}
  if(!session.id||typeof session.email!=='string')return null;
  const profile=await factorProfile(session.id);
  if(!profile||profile.is_banned||profile.deleted_at)return null;
  if(!profile.totp_enabled&&(session.mfaVersion??0)===profile.mfa_version)return session;
  const grant=await readGrant(factorHash(token));return grant?.id===session.id?grant:null;
}
export async function beginLoginChallenge(userId:string,sessionHash:string|null=null) {
  const token=factorToken();
  const {error}=await (await service()).rpc('begin_factor_challenge',{p_user_id:userId,p_hash:factorHash(token),p_kind:'login',p_session_hash:sessionHash});
  if(error)throw new Error('Login challenge unavailable');
  return {mfaRequired:true,challengeToken:token};
}
export async function claimFactorChallenge(token:string,kind:'login'|'setup') {
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const {data,error}=await (await service()).rpc('claim_factor_challenge',{p_hash:factorHash(token),p_kind:kind});
  if(error)throw new Error('Factor challenge unavailable');
  return data as FactorChallenge|null;
}
export async function verifyFactorProof(profile:FactorProfile,input:{code?:string;recoveryCode?:string}) {
  if(input.code&&profile.totp_secret){
    const result=verifySync({token:input.code,secret:decryptFactor(profile.totp_secret),epochTolerance:30});
    if(result.valid&&'timeStep' in result&&typeof result.timeStep==='number')return {step:result.timeStep,recoveryHash:null};
  }else if(input.recoveryCode){
    for(const hash of profile.recovery_codes??[])if(await bcrypt.compare(input.recoveryCode.toUpperCase().replace(/^([A-F0-9]{5})-?([A-F0-9]{5})$/,'$1-$2'),hash))return {step:null,recoveryHash:hash};
  }
  return null;
}
export async function directLoginResponse(user:{id:string;email:string|null},clientProfile:unknown,request?:Request) {
  const profile=await factorProfile(user.id);
  if(!profile||profile.is_banned||profile.deleted_at)return NextResponse.json({error:'Account unavailable'},{status:403});
  if(profile.totp_enabled)return factorSessionResponse(await beginLoginChallenge(user.id),undefined,202,request);
  const {createDoSession}=await import('@/lib/db/unified-client');
  const token=await createDoSession({id:user.id,email:user.email??'',mfaVersion:profile.mfa_version});
  return factorSessionResponse({ok:true,token,user:clientProfile},token,200,request);
}
export function factorSessionResponse(data:unknown,token?:string,status=200,request?:Request) {
  const response=NextResponse.json(data,{status});
  response.headers.set('Cache-Control','no-store');
  if(token&&(!request||!isStatelessNativeAuth(request)))response.cookies.set('liravo-session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:604800,path:'/'});
  return response;
}

export async function currentFactorSessionHash(userId:string) {
  const {headers,cookies}=await
  import('next/headers');
  const authorization=(await headers()).get('authorization');
  const bearer=authorization?.startsWith('Bearer ')?authorization.slice(7):undefined;
  if((await import('@/lib/db/provider')).isDirectPostgres()){
    const token=bearer??(await cookies()).get('liravo-session')?.value;
    if(!token)throw new Error('Authenticated session required');
    return factorHash(token);
  }
  const {createClient}=await import('@/lib/supabase/server');
  const token=bearer??(await (await createClient({skipMfa:true})).auth.getSession()).data.session?.access_token;
  if(!token)throw new Error('Authenticated provider session required');
  return providerSessionHash(userId,token);
}
