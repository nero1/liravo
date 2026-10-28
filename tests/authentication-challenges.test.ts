import {beforeAll,beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextResponse} from 'next/server';
import {createHash,createHmac} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {POST as telegramLogin} from '@/app/api/auth/telegram/route';
import {POST as passwordLogin} from '@/app/api/auth/login/route';
import {POST as signup} from '@/app/api/auth/signup/route';
import {GET as authConfig} from '@/app/api/auth/config/route';
import {AuthChallengeError,verifyAuthChallenge} from '@/lib/auth/challenges';
import {createServiceClient} from '@/lib/supabase/server';
import {createDoSession} from '@/lib/db/unified-client';
import {directLoginResponse} from '@/lib/auth/second-factor';
import {getRedisClient} from '@/lib/redis';
import {isDirectPostgres} from '@/lib/db/provider';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/second-factor',()=>({directLoginResponse:vi.fn()}));
vi.mock('@/lib/db/unified-client',()=>({createDoSession:vi.fn(),SESSION_COOKIE:'liravo-session',SESSION_TTL:604800}));
vi.mock('@/lib/redis',()=>({getRedisClient:vi.fn()}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:vi.fn()}));
const id='00000000-0000-4000-8000-000000003901',profile={id,email:null,username:'telegram_fixture'},bot='123456789:isolated-test-bot-token';
const payload={id:42,first_name:'Fixture',username:'fixture_reader',auth_date:1793102400,hash:'5b0bd48dcb6fa78af31b7b75caf54e200dc846e37b784d823301f089244873d2'};
let passwordHash='',lookup:unknown=null,queryError:unknown=null,initialFailures=0;const counts=new Map<string,number>(),rpc=vi.fn(),redisGet=vi.fn(),redisDel=vi.fn();
const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({data:lookup,error:queryError})};
const request=(body:unknown,path='telegram',headers:Record<string,string>={})=>new Request('https://app.test/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const sign=(data:Record<string,string|number|boolean>)=>({...data,hash:createHmac('sha256',createHash('sha256').update(bot).digest()).update(Object.keys(data).sort().map(key=>key+'='+data[key]).join('\n')).digest('hex')});
beforeAll(async()=>{passwordHash=await bcrypt.hash('fixture-password',12);});
beforeEach(()=>{
  vi.clearAllMocks();vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));vi.stubEnv('TELEGRAM_BOT_TOKEN',bot);vi.stubEnv('HCAPTCHA_SECRET_KEY','');vi.stubEnv('HCAPTCHA_SITE_KEY','');vi.stubEnv('HCAPTCHA_ALLOWED_HOSTNAMES','app.test');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.test');
  lookup={...profile,email:'fixture@example.test',password_hash:passwordHash,deleted_at:null};queryError=null;initialFailures=0;counts.clear();
  vi.mocked(isDirectPostgres).mockReturnValue(true);vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:true,remaining:4,resetAt:0});
  vi.mocked(createServiceClient).mockReturnValue({from:()=>builder,rpc} as never);vi.mocked(createDoSession).mockResolvedValue('isolated-session-token');
  vi.mocked(directLoginResponse).mockResolvedValue(NextResponse.json({ok:true,user:profile}));
  rpc.mockImplementation(async(name,args)=>{
    if(name==='resolve_direct_social_identity')return {data:profile,error:queryError};
    if(name==='find_direct_account')return {data:lookup,error:queryError};
    if(name==='create_direct_account'){lookup={id:args.p_id,email:args.p_email,username:args.p_username,password_hash:args.p_password_hash};return {data:lookup,error:queryError};}
    return {data:null,error:null};
  });
  redisGet.mockImplementation(async key=>String(counts.get(key)??initialFailures));redisDel.mockResolvedValue(1);
  vi.mocked(getRedisClient).mockReturnValue({get:redisGet,del:redisDel,incrementWindow:async(key:string)=>{const value=(counts.get(key)??initialFailures)+1;counts.set(key,value);return value;}} as never);
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('accepts the independently OpenSSL-signed Telegram Login Widget vector through the normal MFA gate',async()=>{
  const response=await telegramLogin(request(payload));expect(response.status).toBe(200);expect(directLoginResponse).toHaveBeenCalledWith(profile,profile,expect.any(Request));
  expect(rpc).toHaveBeenCalledWith('resolve_direct_social_identity',expect.objectContaining({p_provider:'telegram',p_subject:'42',p_email:null}));
});
it('rejects tampering, malformed identities, stale widget proofs and the Web App signature algorithm',async()=>{
  expect((await telegramLogin(request({...payload,id:43}))).status).toBe(401);
  expect((await telegramLogin(request({...payload,id:42.5}))).status).toBe(400);
  expect((await telegramLogin(request({...payload,hash:'z'.repeat(64)}))).status).toBe(400);
  const {hash:_,...data}=payload,message=Object.keys(data).sort().map(key=>key+'='+data[key as keyof typeof data]).join('\n');
  const wrong=createHmac('sha256',createHmac('sha256','WebAppData').update(bot).digest()).update(message).digest('hex');
  expect((await telegramLogin(request({...data,hash:wrong}))).status).toBe(401);
  vi.setSystemTime(new Date('2026-10-27T12:10:01Z'));expect((await telegramLogin(request(payload))).status).toBe(401);expect(directLoginResponse).not.toHaveBeenCalled();
});
it('includes signed scalar extension fields instead of silently discarding them',async()=>{
  const signed=sign({id:42,first_name:'Fixture',auth_date:payload.auth_date,allows_write_to_pm:true});expect((await telegramLogin(request(signed))).status).toBe(200);
  expect((await telegramLogin(request({...signed,allows_write_to_pm:false}))).status).toBe(401);
});
it('publishes only public challenge configuration and fails closed for missing, invalid and unavailable proofs',async()=>{
  expect(await authConfig().json()).toEqual({enabled:false,siteKey:null});vi.stubEnv('HCAPTCHA_SECRET_KEY','isolated-captcha-secret');
  await expect(verifyAuthChallenge(undefined,request({}))).rejects.toMatchObject({status:503,code:'CAPTCHA_UNAVAILABLE'});
  vi.stubEnv('HCAPTCHA_SITE_KEY','isolated-site-key');const config=await authConfig().json();expect(config).toEqual({enabled:true,siteKey:'isolated-site-key'});expect(JSON.stringify(config)).not.toContain('isolated-captcha-secret');
  await expect(verifyAuthChallenge(undefined,request({}))).rejects.toMatchObject({status:400,code:'CAPTCHA_REQUIRED'});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({success:false}),{status:200})));
  await expect(verifyAuthChallenge('proof',request({}))).rejects.toBeInstanceOf(AuthChallengeError);
  vi.mocked(fetch).mockRejectedValueOnce(new Error('isolated network failure'));await expect(verifyAuthChallenge('proof',request({}))).rejects.toMatchObject({status:503});
});
it('binds verification to the configured site key and host and rejects malformed provider acknowledgements',async()=>{
  vi.stubEnv('HCAPTCHA_SECRET_KEY','isolated-captcha-secret');vi.stubEnv('HCAPTCHA_SITE_KEY','isolated-site-key');
  const transport=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,hostname:'app.test'}),{status:200}));vi.stubGlobal('fetch',transport);
  await expect(verifyAuthChallenge('valid-proof',request({}))).resolves.toBeUndefined();const body=transport.mock.calls[0][1].body as URLSearchParams;
  expect(transport.mock.calls[0][0]).toBe('https://api.hcaptcha.com/siteverify');expect(body.get('response')).toBe('valid-proof');expect(body.get('sitekey')).toBe('isolated-site-key');expect(body.get('secret')).toBe('isolated-captcha-secret');
  transport.mockResolvedValueOnce(new Response(JSON.stringify({success:true,hostname:'foreign.test'}),{status:200}));await expect(verifyAuthChallenge('foreign-proof',request({}))).rejects.toMatchObject({status:422});
  transport.mockResolvedValueOnce(new Response('truncated',{status:200}));await expect(verifyAuthChallenge('bad-proof',request({}))).rejects.toMatchObject({status:503});
});
it('requires CAPTCHA after the third failure across account and IP counters before looking up credentials',async()=>{
  vi.stubEnv('HCAPTCHA_SECRET_KEY','isolated-captcha-secret');vi.stubEnv('HCAPTCHA_SITE_KEY','isolated-site-key');initialFailures=2;
  const failed=await passwordLogin(request({email:'fixture@example.test',password:'wrong-password'},'login'));expect(failed.status).toBe(401);expect(await failed.json()).toMatchObject({requireCaptcha:true});
  rpc.mockClear();const required=await passwordLogin(request({email:'fixture@example.test',password:'fixture-password'},'login'));expect(required.status).toBe(400);expect(await required.json()).toMatchObject({code:'CAPTCHA_REQUIRED',requireCaptcha:true});expect(rpc).not.toHaveBeenCalled();expect(directLoginResponse).not.toHaveBeenCalled();
});
it('accepts a verified human proof, normalizes the email and retains the MFA-aware login response',async()=>{
  vi.stubEnv('HCAPTCHA_SECRET_KEY','isolated-captcha-secret');vi.stubEnv('HCAPTCHA_SITE_KEY','isolated-site-key');initialFailures=3;
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,hostname:'app.test'}),{status:200})));
  vi.mocked(directLoginResponse).mockResolvedValueOnce(NextResponse.json({mfaRequired:true,challengeToken:'isolated-challenge'},{status:202}));
  const response=await passwordLogin(request({email:' Fixture@Example.test ',password:'fixture-password',hcaptchaToken:'valid-proof'},'login'));expect(response.status).toBe(202);expect(await response.json()).toMatchObject({mfaRequired:true});
  expect(rpc).toHaveBeenCalledWith('find_direct_account',{p_email:'fixture@example.test'});expect(redisDel).toHaveBeenCalledWith(expect.arrayContaining(['auth:fail:unknown']));
  expect(directLoginResponse).toHaveBeenCalledWith(expect.objectContaining({id}),expect.not.objectContaining({password_hash:expect.anything()}),expect.any(Request));
});
it('does not distinguish a missing account from an account without a local password',async()=>{
  lookup=null;const absent=await passwordLogin(request({email:'missing@example.test',password:'wrong-password'},'login'));
  lookup={...profile,email:'fixture@example.test',password_hash:null,deleted_at:null};const social=await passwordLogin(request({email:'fixture@example.test',password:'wrong-password'},'login'));
  expect(absent.status).toBe(401);expect(social.status).toBe(401);expect(await absent.json()).toEqual(await social.json());expect(directLoginResponse).not.toHaveBeenCalled();
});
it('enforces configured signup proof and bounds UTF-8 password length without truncation aliases',async()=>{
  vi.stubEnv('HCAPTCHA_SECRET_KEY','isolated-captcha-secret');vi.stubEnv('HCAPTCHA_SITE_KEY','isolated-site-key');
  expect((await signup(request({email:'new@example.test',password:'fixture-password'},'signup'))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();expect(createDoSession).not.toHaveBeenCalled();
  const long='😀'.repeat(19);const response=await passwordLogin(request({email:'fixture@example.test',password:long},'login'));expect(response.status).toBe(422);expect(await response.json()).toMatchObject({code:'PASSWORD_TOO_LONG'});
});
it('creates a bounded canonical signup profile and never returns password hashes or native cookies',async()=>{
  lookup=null;const email='A'.repeat(64)+'@example.test';const response=await signup(request({email,password:'fixture-password'},'signup',{'X-Liravo-Client':'native'}));expect(response.status).toBe(200);
  const args=rpc.mock.calls.find(([name])=>name==='create_direct_account')![1];expect(args.p_username).toMatch(/^[a-z0-9_]{3,30}$/);expect(args.p_display_name.length).toBeLessThanOrEqual(50);expect(await bcrypt.compare('fixture-password',args.p_password_hash)).toBe(true);
  const result=await response.json();expect(result.user).not.toHaveProperty('password_hash');expect(result.token).toBe('isolated-session-token');expect(response.headers.has('set-cookie')).toBe(false);
},15_000);
it('fails closed for database, session storage and quota failures',async()=>{
  queryError={code:'08006'};expect((await passwordLogin(request({email:'fixture@example.test',password:'fixture-password'},'login'))).status).toBe(503);expect(createDoSession).not.toHaveBeenCalled();
  queryError=null;lookup=null;vi.mocked(createDoSession).mockRejectedValueOnce(new Error('isolated Redis failure'));expect((await signup(request({email:'new@example.test',password:'fixture-password'},'signup'))).status).toBe(503);
  vi.mocked(checkCriticalRateLimit).mockResolvedValueOnce({allowed:false,remaining:0,resetAt:0});expect((await passwordLogin(request({email:'fixture@example.test',password:'fixture-password'},'login'))).status).toBe(429);
},15_000);
