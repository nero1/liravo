import { beforeEach, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';
import { invalidateFeatureFlag } from '@/lib/feature-flags';
import { PATCH } from '@/app/api/admin/feature-flags/route';

vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/moderation',()=>({isAdmin:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/feature-flags',()=>({invalidateFeatureFlag:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());
const request=(body: unknown)=>new Request('https://app.test/api/admin/feature-flags',{method:'PATCH',body:JSON.stringify(body)});

it('rejects legacy malformed payloads and forwards the authenticated administrator to the atomic flag routine',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue({id:'admin-user',email:''});
  vi.mocked(isAdmin).mockResolvedValue(true);
  const rpc=vi.fn().mockResolvedValue({data:true,error:null});
  vi.mocked(createServiceClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createServiceClient>);
  expect((await PATCH(request({key:'google_auth',value:false}))).status).toBe(400);
  expect((await PATCH(request({name:'google_auth',enabled:false,actor_id:'forged'}))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('set_feature_flag_atomic',{p_actor_id:'admin-user',p_name:'google_auth',p_enabled:false});
  expect(invalidateFeatureFlag).toHaveBeenCalledWith('google_auth');
  rpc.mockResolvedValue({data:null,error:{code:'P1006'}});
  expect((await PATCH(request({name:'telegram_auth',enabled:false}))).status).toBe(409);
});

it('requires administrator authorization and reports a retryable cache-sync failure after a committed update',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue({id:'reader',email:''});
  vi.mocked(isAdmin).mockResolvedValue(false);
  expect((await PATCH(request({name:'google_auth',enabled:false}))).status).toBe(403);
  expect(createServiceClient).not.toHaveBeenCalled();
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(createServiceClient).mockReturnValue({rpc:vi.fn().mockResolvedValue({data:false,error:null})} as unknown as ReturnType<typeof createServiceClient>);
  vi.mocked(invalidateFeatureFlag).mockRejectedValueOnce(new Error('Redis unavailable'));
  const response=await PATCH(request({name:'google_auth',enabled:false}));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({code:'FLAG_CACHE_UNAVAILABLE'});
});
