import {beforeEach,expect,it,vi} from 'vitest';
import {GET} from '@/app/api/subscriptions/status/route';
import {POST as account} from '@/app/api/mobile/billing-account/route';
import {POST as verify} from '@/app/api/mobile/verify-purchase/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {checkMoneyRateLimit} from '@/lib/rate-limit';
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkMoneyRateLimit:vi.fn()}));
vi.mock('@/lib/google-play',async original=>({...await original<typeof import('@/lib/google-play')>(),googlePlayAccountId:()=> 'a'.repeat(64)}));
const owner='00000000-0000-4000-8000-000000008601',rpc=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:owner,email:'billing@example.test'});vi.mocked(createServiceClient).mockReturnValue({rpc}as never);vi.mocked(checkMoneyRateLimit).mockResolvedValue({allowed:true}as never);rpc.mockResolvedValue({data:{active:false,subscriptions:[]},error:null});});
it('returns a private owned authoritative snapshot and never reads another requested account',async()=>{
  const response=await GET(new Request('https://app.test/api/subscriptions/status?user_id=someone-else'));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.json()).toMatchObject({actorId:owner,active:false,subscriptions:[],googlePlayManageUrl:expect.stringContaining('https://play.google.com/')});expect(rpc).toHaveBeenCalledWith('premium_status_snapshot',{p_user:owner});
});
it('rejects anonymous and changed-account status/purchase requests before billing work',async()=>{
  for(const route of[GET,account,verify])expect((await route(new Request('https://app.test/billing',{headers:{'X-Liravo-Actor':'someone-else'}}))).status).toBe(409);expect(rpc).not.toHaveBeenCalled();expect(checkMoneyRateLimit).not.toHaveBeenCalled();vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test/billing'))).status).toBe(401);
});
it('reports unavailable or inactive accounts without falling back to cached Premium flags',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:'P1003'}});expect((await GET(new Request('https://app.test/status'))).status).toBe(403);rpc.mockRejectedValueOnce(new Error('Storage unavailable'));expect((await GET(new Request('https://app.test/status'))).status).toBe(503);
});
it('binds the billing account acknowledgement to the authenticated owner',async()=>{
  rpc.mockResolvedValueOnce({data:'a'.repeat(64),error:null});expect(await(await account(new Request('https://app.test/billing',{method:'POST'}))).json()).toEqual({actorId:owner,accountId:'a'.repeat(64)});
});
