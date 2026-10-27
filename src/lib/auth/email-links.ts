import {z} from 'zod';
import {createServiceClient,createClient} from '@/lib/supabase/server';
import {isDirectPostgres} from '@/lib/db/provider';
import {beginLoginChallenge,directLoginResponse,factorHash,factorProfile,factorSessionResponse,providerSessionHash,providerTokenCurrent} from './second-factor';
import {clientUser} from '@/lib/user-profile';
import {NextResponse} from 'next/server';

export const emailRequest=z.object({email:z.string().trim().email().max(254).toLowerCase(),pin:z.string().regex(/^\d{4}$/).optional()}).strict();
export const emailProof=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const emailResponse=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export function emailLink(purpose:'verify'|'recover',token:string){
  const url=new URL('/email/confirm',process.env.NEXT_PUBLIC_APP_URL??'https://liravo.org');
  url.hash=new URLSearchParams({purpose,token}).toString();return url.toString();
}
export function emailLanding(request:Request,purpose:'verify'|'recover'){
  const token=new URL(request.url).searchParams.get('token');
  const response=NextResponse.redirect(emailLink(purpose,token&&/^[a-f0-9]{64}$/.test(token)?token:''),303);
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
}
export async function discardEmailProof(hash:string){
  const {error}=await createServiceClient().from('auth_email_challenges' as never).delete().eq('token_hash',hash);
  if(error)throw new Error('Email proof cleanup unavailable');
}
export async function recoverySession(user:{id:string;email:string},request:Request){
  const service=createServiceClient(),{data:profile,error}=await service.from('users').select('*').eq('id',user.id).single();
  if(error||!profile)throw new Error('Profile unavailable');
  if(isDirectPostgres())return directLoginResponse(user,clientUser(profile),request);
  const factor=await factorProfile(user.id);if(!factor||factor.is_banned||factor.deleted_at)throw new Error('Account unavailable');
  const lookup=await service.auth.admin.getUserById(user.id);
  if(lookup.error||lookup.data.user?.id!==user.id)throw new Error('Provider identity unavailable');
  let providerEmail=lookup.data.user.email;
  if(!providerEmail){
    const linked=await service.auth.admin.updateUserById(user.id,{email:user.email,email_confirm:true});
    if(linked.error||linked.data.user?.id!==user.id||linked.data.user.email!==user.email)throw new Error('Provider email unavailable');
    providerEmail=user.email;
  }
  const generated=await service.auth.admin.generateLink({type:'magiclink',email:providerEmail});
  if(generated.error||generated.data.user?.id!==user.id||!generated.data.properties?.hashed_token)throw new Error('Provider recovery unavailable');
  const client=createClient({skipMfa:true});
  const verified=await client.auth.verifyOtp({type:'magiclink',token_hash:generated.data.properties.hashed_token});
  if(verified.error||verified.data.user?.id!==user.id||!verified.data.session){await client.auth.signOut({scope:'local'});throw new Error('Provider recovery unavailable');}
  const session=verified.data.session;
  if(!providerTokenCurrent(session.access_token,Number(factor.auth_not_before??0)))throw new Error('Provider recovery session expired');
  const revoked=await service.auth.admin.signOut(session.access_token,'others');if(revoked.error)throw new Error('Provider session revocation unavailable');
  const native=request.headers.get('x-liravo-client')==='native'&&!['cookie','origin','sec-fetch-site','sec-fetch-mode'].some(name=>request.headers.has(name));
  const result=factor.totp_enabled?await beginLoginChallenge(user.id,providerSessionHash(user.id,session.access_token)):{ok:true,user:clientUser(profile)};
  return factorSessionResponse({...result,...(native?{session:{access_token:session.access_token,refresh_token:session.refresh_token}}:{})},undefined,factor.totp_enabled?202:200,request);
}
export const emailHash=factorHash;
