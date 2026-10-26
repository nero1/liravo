import { afterEach, expect, it, vi } from 'vitest';
import { generateSecret, generateSync } from 'otplib';
import bcrypt from 'bcryptjs';
import { decryptFactor, encryptFactor, factorHash, factorSessionToken, providerSessionHash, verifyFactorProof, type FactorProfile } from '@/lib/auth/second-factor';

const grantDb=vi.hoisted(()=>({eq:vi.fn(async()=>({error:null}))}));
vi.mock('@/lib/redis',()=>({getRedisClient:vi.fn(()=>{throw new Error('Redis unavailable');})}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({from:()=>({delete:()=>({eq:grantDb.eq})})})}));
afterEach(()=>vi.unstubAllEnvs());
const profile=(secret:string):FactorProfile=>({id:crypto.randomUUID(),email:'fixture@example.test',username:'fixture',totp_enabled:true,totp_secret:secret,recovery_codes:[],mfa_version:1,mfa_last_step:null,is_banned:false,deleted_at:null});

it('rejects invalid and expired OTP results rather than accepting their result objects',async()=>{
  const secret=generateSecret(),code=generateSync({secret});
  const invalid=code.slice(0,5)+(code[5]==='0'?'1':'0');
  expect(await verifyFactorProof(profile(secret),{code:invalid})).toBeNull();
  expect(await verifyFactorProof(profile(secret),{code:generateSync({secret,epoch:Math.floor(Date.now()/1000)-120})})).toBeNull();
  expect(await verifyFactorProof(profile(secret),{code})).toMatchObject({step:expect.any(Number),recoveryHash:null});
});
it('authenticates encrypted secrets and rejects changed ciphertext',async()=>{
  vi.stubEnv('AUTH_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64'));
  const secret=generateSecret(),encrypted=encryptFactor(secret);
  expect(encrypted).not.toContain(secret);expect(decryptFactor(encrypted)).toBe(secret);
  expect(await verifyFactorProof(profile(encrypted),{code:generateSync({secret})})).toMatchObject({step:expect.any(Number)});
  const parts=encrypted.split(':');const bytes=Buffer.from(parts[3],'base64');bytes[0]^=1;parts[3]=bytes.toString('base64');
  expect(()=>decryptFactor(parts.join(':'))).toThrow();
  vi.stubEnv('AUTH_ENCRYPTION_KEY','');expect(()=>encryptFactor(secret)).toThrow('32 bytes');
});
it('matches recovery hashes and derives independent session identities',async()=>{
  const state=profile(generateSecret());state.recovery_codes=[await bcrypt.hash('ABCDE-12345',4)];
  expect(await verifyFactorProof(state,{recoveryCode:'abcde-12345'})).toEqual({step:null,recoveryHash:state.recovery_codes[0]});
  expect(await verifyFactorProof(state,{recoveryCode:'ABCDE-12346'})).toBeNull();
  const token=factorSessionToken('temporary-login-challenge');expect(token).toMatch(/^mfa_[a-f0-9]{64}$/);expect(factorHash(token)).not.toBe(factorHash('temporary-login-challenge'));
  const jwt='header.'+Buffer.from(JSON.stringify({sub:state.id,session_id:'provider-session'})).toString('base64url')+'.signature';
  expect(providerSessionHash(state.id,jwt)).toBe(factorHash(`supabase:${state.id}:provider-session`));
  expect(()=>providerSessionHash(crypto.randomUUID(),jwt)).toThrow();
});

it('revokes a database factor session even when Redis is unavailable',async()=>{
  const {destroySession}=await import('@/lib/db/unified-client');
  const token=factorSessionToken(crypto.randomUUID());
  await expect(destroySession(token)).resolves.toBeUndefined();
  expect(grantDb.eq).toHaveBeenCalledWith('session_hash',factorHash(token));
});
