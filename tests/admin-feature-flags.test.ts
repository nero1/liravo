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

it('requires administrator authorization and acknowledges an authoritative database update',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue({id:'reader',email:''});
  vi.mocked(isAdmin).mockResolvedValue(false);
  expect((await PATCH(request({name:'google_auth',enabled:false}))).status).toBe(403);
  expect(createServiceClient).not.toHaveBeenCalled();
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(createServiceClient).mockReturnValue({rpc:vi.fn().mockResolvedValue({data:false,error:null})} as unknown as ReturnType<typeof createServiceClient>);
  vi.mocked(invalidateFeatureFlag).mockResolvedValueOnce(undefined);
  const response=await PATCH(request({name:'google_auth',enabled:false}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({updated:true,changed:false,enabled:false});
});

it('returns private actor-bound snapshots and rejects unavailable or malformed catalogs',async()=>{
  const {GET}=await import('@/app/api/admin/feature-flags/route');
  vi.mocked(getCurrentUser).mockResolvedValue({id:'admin-user',email:''});vi.mocked(isAdmin).mockResolvedValue(true);
  const order=vi.fn(),select=vi.fn(()=>({order})),from=vi.fn(()=>({select}));
  vi.mocked(createServiceClient).mockReturnValue({from} as unknown as ReturnType<typeof createServiceClient>);
  const read=(actor='admin-user')=>GET(new Request('https://app.test/api/admin/feature-flags',{headers:{'X-Liravo-Actor':actor}}));
  expect((await read('previous-admin')).status).toBe(409);expect(from).not.toHaveBeenCalled();
  for(const result of[{data:null,error:null},{data:[],error:{message:'private SQL details'}},{data:[{enabled:'true'}],error:null}]){
    order.mockResolvedValueOnce(result);const response=await read();expect(response.status).toBe(503);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(await response.json()).toEqual({error:'Flags unavailable'});
  }
  const flags=[{id:'flag',name:'google_auth',enabled:true,description:null,updated_at:'2026-11-05T12:30:00.123456+00:00'}];
  order.mockResolvedValueOnce({data:flags,error:null});expect(await(await read()).json()).toEqual({actorId:'admin-user',flags});
  order.mockResolvedValueOnce({data:[],error:null});const response=await read();expect(await response.json()).toEqual({actorId:'admin-user',flags:[]});
});

it('rejects stale actors before mutation and keeps failure responses private',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue({id:'admin-user',email:''});vi.mocked(isAdmin).mockResolvedValue(true);
  const response=await PATCH(new Request('https://app.test/api/admin/feature-flags',{method:'PATCH',headers:{'X-Liravo-Actor':'previous-admin'},body:JSON.stringify({name:'google_auth',enabled:false})}));
  expect(response.status).toBe(409);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(createServiceClient).not.toHaveBeenCalled();
});
