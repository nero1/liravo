import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextResponse} from 'next/server';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {isDirectPostgres} from '@/lib/db/provider';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {verifyAccountPin,PinError} from '@/lib/account-pin';
import {sendEmail,buildVerificationEmail} from '@/lib/email';
import {beginLoginChallenge,directLoginResponse,factorProfile} from '@/lib/auth/second-factor';
import {emailHash,recoverySession} from '@/lib/auth/email-links';
import {POST as sendVerification} from '@/app/api/users/send-verification/route';
import {POST as requestRecovery} from '@/app/api/users/account-recovery/route';
import {GET as openVerification,POST as confirmEmail} from '@/app/api/users/verify-email/route';
import {GET as openRecovery,POST as confirmRecovery} from '@/app/api/users/verify-recovery/route';
import {POST as setupFactor} from '@/app/api/auth/2fa/setup/route';
import {POST as googleLogin} from '@/app/api/auth/google/route';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:vi.fn()}));
vi.mock('@/lib/email',async original=>({...await original<typeof import('@/lib/email')>(),sendEmail:vi.fn()}));
vi.mock('@/lib/account-pin',async original=>({...await original<typeof import('@/lib/account-pin')>(),verifyAccountPin:vi.fn()}));
vi.mock('@/lib/auth/second-factor',async original=>({...await original<typeof import('@/lib/auth/second-factor')>(),beginLoginChallenge:vi.fn(),directLoginResponse:vi.fn(),factorProfile:vi.fn(),currentFactorSessionHash:async()=>'a'.repeat(64)}));
const id='00000000-0000-4000-8000-000000003701',token='a'.repeat(64),pinHash='$2b$12$'+'a'.repeat(53);
const profile={id,email:'old@example.test',display_name:'Email fixture',username:'email_fixture',onboarding_complete:true};
const rpc=vi.fn(),remove=vi.fn(),getUserById=vi.fn(),generateLink=vi.fn(),updateUserById=vi.fn(),verifyOtp=vi.fn(),signOut=vi.fn(),revokeSessions=vi.fn();
let lookup:unknown=profile,lookupError:unknown=null;
const eq=vi.fn(),builder={select:()=>builder,eq,maybeSingle:async()=>({data:lookup,error:lookupError}),single:async()=>({data:lookup,error:lookupError}),delete:()=>({eq:remove}),update:()=>({eq:async()=>({error:lookupError})})};
const request=(body:unknown,path='send-verification',headers:Record<string,string>={})=>new Request('https://app.test/api/users/'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();lookup=profile;lookupError=null;eq.mockReturnValue(builder);
  vi.mocked(getCurrentUser).mockResolvedValue({id,email:profile.email});vi.mocked(isDirectPostgres).mockReturnValue(true);
  vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:true,remaining:4,resetAt:0});vi.mocked(verifyAccountPin).mockResolvedValue(pinHash);
  vi.mocked(createServiceClient).mockReturnValue({from:()=>builder,rpc,auth:{admin:{getUserById,generateLink,updateUserById,signOut:revokeSessions}}} as never);
  vi.mocked(createClient).mockReturnValue({auth:{verifyOtp,signOut}} as never);
  vi.mocked(sendEmail).mockResolvedValue({ok:true});remove.mockResolvedValue({error:null});rpc.mockResolvedValue({data:true,error:null});signOut.mockResolvedValue({error:null});revokeSessions.mockResolvedValue({error:null});
  vi.mocked(directLoginResponse).mockResolvedValue(NextResponse.json({mfaRequired:true,challengeToken:token},{status:202}));
  vi.mocked(factorProfile).mockResolvedValue({...profile,totp_enabled:false} as never);
  vi.mocked(beginLoginChallenge).mockResolvedValue({mfaRequired:true,challengeToken:token});
  getUserById.mockResolvedValue({data:{user:{id,email:'provider@example.test'}},error:null});
  generateLink.mockResolvedValue({data:{user:{id},properties:{hashed_token:'provider-proof'}},error:null});
  const accessToken='header.'+Buffer.from(JSON.stringify({sub:id,session_id:'provider-session'})).toString('base64url')+'.signature';
  verifyOtp.mockResolvedValue({data:{user:{id},session:{access_token:accessToken,refresh_token:'provider-refresh'}},error:null});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('sends a pending purpose-bound proof without changing the login email or storing the bearer',async()=>{
  const response=await sendVerification(request({email:' NEW@Example.test ',pin:'2468'}));expect(response.status).toBe(200);
  const mail=vi.mocked(sendEmail).mock.calls[0][0],link=new URL(mail.text.match(/https:\/\/[^\s]+/)![0]);
  const bearer=new URLSearchParams(link.hash.slice(1)).get('token')!;expect(bearer).toMatch(/^[a-f0-9]{64}$/);expect(link.search).toBe('');
  expect(rpc).toHaveBeenCalledWith('issue_email_challenge',{p_user_id:id,p_email:'new@example.test',p_purpose:'verify',p_hash:emailHash(bearer),p_pin_hash:pinHash});
  expect(JSON.stringify(rpc.mock.calls)).not.toContain(bearer);expect(profile.email).toBe('old@example.test');expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('denies wrong PINs, stale actors, unavailable storage and failed delivery without falsely acknowledging verification',async()=>{
  vi.mocked(verifyAccountPin).mockRejectedValueOnce(new PinError('PIN_INVALID',403));expect((await sendVerification(request({email:'new@example.test',pin:'1357'}))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
  expect((await sendVerification(request({email:'new@example.test' },'send-verification',{'X-Liravo-Actor':'other'}))).status).toBe(409);
  vi.mocked(sendEmail).mockResolvedValueOnce({ok:false,error:'fixture delivery failure'});
  expect((await sendVerification(request({email:'new@example.test',pin:'2468'}))).status).toBe(503);expect(remove).toHaveBeenCalledWith('token_hash',expect.stringMatching(/^[a-f0-9]{64}$/));
  lookupError={code:'08006'};expect((await sendVerification(request({email:'new@example.test',pin:'2468'}))).status).toBe(503);
});
it('keeps known, unknown and undeliverable recovery responses identical and rate-limits email identities',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:null});const unknown=await requestRecovery(request({email:'unknown@example.test'}));
  rpc.mockResolvedValueOnce({data:profile,error:null});const known=await requestRecovery(request({email:'old@example.test'}));
  rpc.mockResolvedValueOnce({data:profile,error:null});vi.mocked(sendEmail).mockResolvedValueOnce({ok:false,error:'fixture'});const failed=await requestRecovery(request({email:'old@example.test'}));
  expect([unknown.status,known.status,failed.status]).toEqual([202,202,202]);expect(await unknown.json()).toEqual(await known.json());expect(await failed.json()).toEqual({ok:true,message:'If this address belongs to a verified account, a recovery link will arrive shortly.'});
  expect(checkCriticalRateLimit).toHaveBeenCalledWith('recovery:address:'+emailHash('old@example.test'));
  vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:false,remaining:0,resetAt:0});expect((await requestRecovery(request({email:'old@example.test'}))).status).toBe(429);
});
it('opens links without consuming them and requires a bounded POST for the correct purpose',async()=>{
  for(const [get,purpose] of [[openVerification,'verify'],[openRecovery,'recover']] as const){const response=get(new Request('https://app.test/api/users/verify-email?token='+token));expect(response.status).toBe(303);expect(response.headers.get('Location')).toContain('#purpose='+purpose+'&token='+token);}
  expect(rpc).not.toHaveBeenCalled();rpc.mockResolvedValueOnce({data:{id,email:profile.email},error:null});
  expect((await confirmEmail(request({token}))).status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('consume_email_challenge',{p_hash:emailHash(token),p_purpose:'verify'});
  rpc.mockResolvedValueOnce({data:null,error:null});expect((await confirmEmail(request({token}))).status).toBe(410);
  expect((await confirmEmail(request({token:token+'a'}))).status).toBe(422);
  expect((await confirmRecovery(request({token:'a'.repeat(201)}))).status).toBe(413);
});
it('recovers direct accounts through the normal MFA-aware login gate and refuses consumed proofs',async()=>{
  rpc.mockResolvedValueOnce({data:{id,email:profile.email},error:null});const response=await confirmRecovery(request({token}));expect(response.status).toBe(202);expect(await response.json()).toMatchObject({mfaRequired:true});
  expect(directLoginResponse).toHaveBeenCalledWith({id,email:profile.email},expect.objectContaining({id}),expect.any(Request));
  rpc.mockResolvedValueOnce({data:null,error:null});expect((await confirmRecovery(request({token}))).status).toBe(410);expect(directLoginResponse).toHaveBeenCalledOnce();
});
it('binds managed recovery to the original provider UID and preserves the second factor',async()=>{
  vi.mocked(isDirectPostgres).mockReturnValue(false);
  vi.mocked(factorProfile).mockResolvedValue({...profile,totp_enabled:true} as never);
  const response=await recoverySession({id,email:profile.email},request({token}));expect(response.status).toBe(202);expect(await response.json()).toEqual({mfaRequired:true,challengeToken:token});
  expect(generateLink).toHaveBeenCalledWith({type:'magiclink',email:'provider@example.test'});expect(revokeSessions).toHaveBeenCalledWith(expect.any(String),'others');expect(beginLoginChallenge).toHaveBeenCalledWith(id,emailHash('supabase:'+id+':provider-session'));
  generateLink.mockResolvedValueOnce({data:{user:{id:'foreign'},properties:{hashed_token:'foreign-proof'}},error:null});
  await expect(recoverySession({id,email:profile.email},request({token}))).rejects.toThrow('Provider recovery');expect(verifyOtp).toHaveBeenCalledOnce();
});
it('links an email-less managed identity only after proof and refuses a foreign verified session',async()=>{
  vi.mocked(isDirectPostgres).mockReturnValue(false);getUserById.mockResolvedValueOnce({data:{user:{id,email:null}},error:null});updateUserById.mockResolvedValueOnce({data:{user:{id,email:profile.email}},error:null});
  const response=await recoverySession({id,email:profile.email},request({token}));expect(response.status).toBe(200);expect(updateUserById).toHaveBeenCalledWith(id,{email:profile.email,email_confirm:true});
  verifyOtp.mockResolvedValueOnce({data:{user:{id:'foreign'},session:{access_token:'foreign'}},error:null});await expect(recoverySession({id,email:profile.email},request({token}))).rejects.toThrow('Provider recovery');expect(signOut).toHaveBeenCalledWith({scope:'local'});
});
it('requires configured PIN proof before revealing enrollment recovery codes and rejects stale actors',async()=>{
  vi.mocked(verifyAccountPin).mockRejectedValueOnce(new PinError('PIN_REQUIRED',403));expect((await setupFactor(request({action:'confirm',enrollmentToken:token,code:'123456'}))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
  expect((await setupFactor(request({action:'start'},'2fa/setup',{'X-Liravo-Actor':'other'}))).status).toBe(409);
});
it('keeps Google identity stable after a recovery email change and fails closed on lookup failures',async()=>{
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID','fixture-client');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({sub:'google-fixture',email:'google@example.test',email_verified:'true',aud:'fixture-client',iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+600})}));
  rpc.mockResolvedValueOnce({data:{...profile,google_id:'google-fixture'},error:null});expect((await googleLogin(request({idToken:'fixture-token'}))).status).toBe(202);expect(rpc).toHaveBeenCalledWith('resolve_localized_social_identity',expect.objectContaining({p_provider:'google',p_subject:'google-fixture',p_email:'google@example.test'}));
  rpc.mockResolvedValueOnce({data:null,error:{code:'08006'}});expect((await googleLogin(request({idToken:'fixture-token'}))).status).toBe(503);
});
it('escapes profile names and URLs in transactional email HTML',()=>{
  const message=buildVerificationEmail('<img src=x onerror=alert(1)>','https://app.test/link?x="unsafe"');expect(message.html).not.toContain('<img');expect(message.html).toContain('&lt;img');expect(message.html).toContain('&quot;unsafe&quot;');expect(message.text).toContain('<img');
});

it('fails managed recovery when revoking older refresh sessions is unavailable',async()=>{
  vi.mocked(isDirectPostgres).mockReturnValue(false);revokeSessions.mockResolvedValueOnce({error:{message:'fixture unavailable'}});
  await expect(recoverySession({id,email:profile.email},request({token}))).rejects.toThrow('revocation unavailable');expect(beginLoginChallenge).not.toHaveBeenCalled();
});

it('rejects expired, foreign and unverified Google claims and distinguishes provider outages from invalid tokens',async()=>{
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID','fixture-client');
  const valid={sub:'google-fixture',email:'google@example.test',email_verified:'true',aud:'fixture-client',iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+600};
  const transport=vi.fn();vi.stubGlobal('fetch',transport);
  for(const changes of [{exp:Math.floor(Date.now()/1000)-1},{iss:'https://foreign.test'},{aud:'foreign-client'},{email_verified:false}]){transport.mockResolvedValueOnce({ok:true,json:async()=>({...valid,...changes})});expect((await googleLogin(request({idToken:'fixture-token'}))).status).toBe(401);}
  expect(rpc).not.toHaveBeenCalled();transport.mockRejectedValueOnce(new Error('isolated provider outage'));expect((await googleLogin(request({idToken:'fixture-token'}))).status).toBe(503);
  transport.mockResolvedValueOnce({ok:false,status:429});expect((await googleLogin(request({idToken:'fixture-token'}))).status).toBe(503);
});
