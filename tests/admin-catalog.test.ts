import {beforeEach,expect,it,vi} from 'vitest';
import {adminCatalogResponse} from '@/lib/admin-catalog';
import {PATCH as users} from '@/app/api/admin/users/route';
import {PATCH as themes} from '@/app/api/admin/themes/route';
import {PATCH as promotions} from '@/app/api/admin/promoted-listings/route';
import {PATCH as flags} from '@/app/api/admin/feature-flags/route';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {requireAdmin,isAdmin} from '@/lib/moderation';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/moderation',()=>({requireAdmin:vi.fn(),isAdmin:vi.fn()}));
vi.mock('@/lib/feature-flags',()=>({invalidateFeatureFlag:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn(async()=>true)}));
const actor='00000000-0000-4000-8000-000000008701',target='00000000-0000-4000-8000-000000008702',rpc=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireAdmin).mockResolvedValue({userId:actor});vi.mocked(isAdmin).mockResolvedValue(true);vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'admin@example.test'});const query={select:()=>query,eq:()=>query,single:async()=>({data:{is_admin:true},error:null})};vi.mocked(createClient).mockReturnValue({from:()=>query}as never);vi.mocked(createServiceClient).mockReturnValue({rpc}as never);rpc.mockResolvedValue({data:{total:27,rows:Array.from({length:26},(_,i)=>({item:{id:'row-'+i},at:'2026-10-30T00:00:00.123456+00:00',key:'row-'+i}))},error:null});});
it('returns complete totals and a precision-preserving actor/filter/catalog cursor',async()=>{
  const result=await adminCatalogResponse(new Request('https://app.test/admin?search=reader'),'users','users'),data=await result.json();expect(result.headers.get('cache-control')).toBe('private, no-store');expect(data.users).toHaveLength(25);expect(data.total).toBe(27);const cursor=JSON.parse(Buffer.from(data.nextCursor,'base64url').toString());expect(cursor).toMatchObject({actorId:actor,scope:'users',search:'reader',at:'2026-10-30T00:00:00.123456+00:00',key:'row-24'});await adminCatalogResponse(new Request('https://app.test/admin?search=reader&cursor='+data.nextCursor),'users','users');expect(rpc).toHaveBeenLastCalledWith('admin_catalog_snapshot',expect.objectContaining({p_at:cursor.at,p_key:'row-24',p_offset:0}));
  for(const [scope,search,owner]of[['books','reader',actor],['users','changed',actor],['users','reader',target]]as const){vi.mocked(requireAdmin).mockResolvedValue({userId:owner});expect((await adminCatalogResponse(new Request('https://app.test/admin?search='+search+'&cursor='+data.nextCursor),scope,'users')).status).toBe(400);}
});
it('retains bounded legacy user pages and rejects malformed pages without catalog reads',async()=>{
  expect((await adminCatalogResponse(new Request('https://app.test/admin?page=2'),'users','users')).status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('admin_catalog_snapshot',expect.objectContaining({p_offset:25}));rpc.mockClear();for(const page of['NaN','1.5','-1','0','10002'])expect((await adminCatalogResponse(new Request('https://app.test/admin?page='+page),'users','users')).status).toBe(400);expect(rpc).not.toHaveBeenCalled();rpc.mockResolvedValueOnce({data:null,error:{code:'P1003'}});expect((await adminCatalogResponse(new Request('https://app.test/admin'),'users','users')).status).toBe(403);
});
it('rejects changed-account admin writes before any mutation and rejects empty user updates',async()=>{
  const request=(body:unknown,changed=true)=>new Request('https://app.test/admin',{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'admin087-owned-key',...(changed?{'X-Liravo-Actor':target}:{})},body:JSON.stringify(body)});
  for(const route of[users,themes,promotions,flags])expect((await route(request({}))).status).toBe(409);expect(rpc).not.toHaveBeenCalled();expect((await users(request({userId:target},false))).status).toBe(400);expect((await users(request({userId:target,is_admin:true},false))).status).toBe(400);
});
it('acknowledges the owned user target and desired flag state',async()=>{
  const request=(body:unknown)=>new Request('https://app.test/admin',{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'admin087-owned-key','X-Liravo-Actor':actor},body:JSON.stringify(body)});rpc.mockResolvedValueOnce({data:{updated:true},error:null});expect(await(await users(request({userId:target,is_suspended:true}))).json()).toMatchObject({actorId:actor,userId:target,updated:true});rpc.mockResolvedValueOnce({data:false,error:null});expect(await(await flags(request({name:'google_auth',enabled:true}))).json()).toMatchObject({actorId:actor,name:'google_auth',enabled:true,updated:true,changed:false});
});

it('preserves long multibyte searches in valid continuation cursors',async()=>{
  rpc.mockResolvedValueOnce({data:{total:26,rows:Array.from({length:26},(_,n)=>({item:{id:target},key:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),at:'2026-10-30T00:00:00.123456+00:00'}))},error:null});
  const search='書'.repeat(200),first=await adminCatalogResponse(new Request('https://app.test/admin?'+new URLSearchParams({search})),'books','books'),data=await first.json();expect(data.nextCursor.length).toBeGreaterThan(1000);expect((await adminCatalogResponse(new Request('https://app.test/admin?'+new URLSearchParams({search,cursor:data.nextCursor})),'books','books')).status).toBe(200);
});

it('does not acknowledge missing or mismatched promotion/flag mutation receipts',async()=>{
  const request=(body:unknown)=>new Request('https://app.test/admin',{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'admin087-bad-receipt'},body:JSON.stringify(body)});
  rpc.mockResolvedValueOnce({data:null,error:null});expect((await flags(request({name:'google_auth',enabled:true}))).status).toBe(503);rpc.mockResolvedValueOnce({data:null,error:null});expect((await promotions(request({id:target,is_active:true}))).status).toBe(503);rpc.mockResolvedValueOnce({data:{id:target,is_active:false},error:null});expect((await promotions(request({id:target,is_active:true}))).status).toBe(503);
});
