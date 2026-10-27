import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import bcrypt from 'bcryptjs';
import {NextRequest} from 'next/server';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {GET,POST,PUT} from '@/app/api/auth/pin/route';
import {PUT as updateProfile} from '@/app/api/users/profile/route';
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:vi.fn(),checkRouteRateLimit:async()=>true}));
const user='00000000-0000-4000-8000-000000003301';let hash:string|null=null,oldHash='',complete=false,queryError=false;
const rpc=vi.fn();const record=()=>({pin_hash:hash,onboarding_complete:complete,is_banned:false,deleted_at:null});
const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({data:record(),error:queryError?{code:'08006'}:null}),single:async()=>({data:record(),error:queryError?{code:'08006'}:null})};
const request=(body:unknown)=>new NextRequest('https://app.test/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeAll(async()=>{oldHash=await bcrypt.hash('2468',12);});
beforeEach(()=>{
  vi.clearAllMocks();hash=null;complete=false;queryError=false;
  vi.mocked(getCurrentUser).mockResolvedValue({id:user,email:'pin@example.test'});
  vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:true,remaining:4,resetAt:0});
  vi.mocked(createServiceClient).mockReturnValue({from:()=>builder,rpc} as never);
  rpc.mockImplementation(async(name,args)=>{
    if(name==='set_account_pin'){hash=args.p_new_hash;return {data:true,error:null};}
    if(name==='update_profile_atomic'){hash=args.p_pin_hash??hash;complete=true;return {data:{id:user,...args.p_changes,pin_hash:hash},error:null};}
    return {data:null,error:null};
  });
});
it('exposes only configured state and never grants a verification without a configured PIN',async()=>{
  expect(await(await GET()).json()).toEqual({configured:false});
  expect((await PUT(request({pin:'2468'}))).status).toBe(404);
  hash=oldHash;expect(await(await GET()).json()).toEqual({configured:true});
  expect((await PUT(request({pin:'1357'}))).status).toBe(403);
  expect(await(await PUT(request({pin:'2468'}))).json()).toEqual({verified:true});
},15_000);
it('requires current proof for PIN changes and keeps acknowledged-state retries idempotent',async()=>{
  hash=oldHash;
  expect((await POST(request({pin:'1357'}))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
  expect((await POST(request({pin:'1357',currentPin:'2468'}))).status).toBe(200);
  const changed=hash!;expect(await bcrypt.compare('1357',changed)).toBe(true);
  expect(rpc).toHaveBeenCalledWith('set_account_pin',{p_user_id:user,p_expected_hash:oldHash,p_new_hash:changed});
  expect((await POST(request({pin:'1357',currentPin:'2468'}))).status).toBe(200);expect(hash).toBe(changed);
},15_000);
it('fails closed for unavailable state, malformed requests, anonymous access and exhausted proof quotas',async()=>{
  hash=oldHash;queryError=true;expect((await GET()).status).toBe(503);queryError=false;
  expect((await POST(request({pin:'1357',user_id:user}))).status).toBe(422);
  vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:false,remaining:0,resetAt:0});
  expect((await PUT(request({pin:'2468'}))).status).toBe(429);expect(rpc).not.toHaveBeenCalled();
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET()).status).toBe(401);
});
it('hashes an onboarding PIN outside profile changes, returns a sanitized user and reuses the stored hash on retry',async()=>{
  const body={username:'pin_onboarding',genres:['Fantasy','Mystery','Thriller','Romance','Poetry'],user_types:['reader'],onboarding_complete:true,pin:'2468'};
  const response=await updateProfile(request(body));expect(response.status).toBe(200);
  const json=await response.json();expect(json.user.id).toBe(user);expect(json.user).not.toHaveProperty('pin_hash');
  const args=rpc.mock.calls.find(([name])=>name==='update_profile_atomic')![1];expect(args.p_changes).not.toHaveProperty('pin');expect(await bcrypt.compare('2468',args.p_pin_hash)).toBe(true);
  const saved=hash;expect((await updateProfile(request(body))).status).toBe(200);expect(hash).toBe(saved);
  expect((await updateProfile(request({...body,pin:'1357'}))).status).toBe(403);
},15_000);

it('rejects a stale account before processing a PIN or profile change',async()=>{
  const stale=new NextRequest('https://app.test/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':'00000000-0000-4000-8000-000000003302'},body:'{"pin":"2468"}'});
  expect((await POST(stale)).status).toBe(409);expect(rpc).not.toHaveBeenCalled();
});
