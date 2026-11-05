import {beforeEach,expect,it,vi} from 'vitest';
import {GET,PATCH} from '@/app/api/admin/books/[id]/audiobook/route';
import {createServiceClient} from '@/lib/supabase/server';
import {requireAdmin} from '@/lib/moderation';
import {checkRouteRateLimit} from '@/lib/rate-limit';
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/moderation',()=>({requireAdmin:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn()}));
const actor='00000000-0000-4000-8000-000000008801',edition='00000000-0000-4000-8000-000000008802',alias='00000000-0000-4000-8000-000000008803',rpc=vi.fn(),params={params:{id:edition}};
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://app.test/audiobook',{method:'PATCH',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireAdmin).mockResolvedValue({userId:actor});vi.mocked(checkRouteRateLimit).mockResolvedValue(true);vi.mocked(createServiceClient).mockReturnValue({rpc}as never);rpc.mockResolvedValue({data:{actorId:actor,bookId:edition,editionId:edition,has_audiobook:true,updated:true},error:null});});
it('rejects null/malformed/oversized edits and changed actors before database mutation',async()=>{
  for(const body of[null,[],true,{}, {has_audiobook:'true'},{has_audiobook:true,is_admin:true}])expect((await PATCH(request(body),params)).status).toBe(400);expect((await PATCH(request({has_audiobook:true,large:'x'.repeat(2050)}),params)).status).toBe(413);expect((await PATCH(request({has_audiobook:true},{'X-Liravo-Actor':alias}),params)).status).toBe(409);expect((await PATCH(request({has_audiobook:true}),{params:{id:'not-a-uuid'}})).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
it('returns owned canonical edition receipts for retained aliases and private recovery reads',async()=>{
  rpc.mockResolvedValue({data:{actorId:actor,bookId:alias,editionId:edition,has_audiobook:true,updated:true},error:null});const response=await PATCH(request({has_audiobook:true},{'X-Liravo-Actor':actor}),{params:{id:alias}});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({actorId:actor,bookId:alias,editionId:edition,has_audiobook:true});expect(rpc).toHaveBeenCalledWith('set_admin_edition_audiobook',{p_actor:actor,p_book:alias,p_enabled:true});const read=await GET(new Request('https://app.test/audiobook'),{params:{id:alias}});expect(read.headers.get('cache-control')).toBe('private, no-store');expect(rpc).toHaveBeenLastCalledWith('admin_edition_audiobook_snapshot',{p_actor:actor,p_book:alias});
});
it('does not acknowledge missing books, storage failure or mismatched receipts',async()=>{
  for(const[code,status]of[['P1005',404],['P1003',403],['08006',503]]as const){rpc.mockResolvedValueOnce({data:null,error:{code}});expect((await PATCH(request({has_audiobook:true}),params)).status).toBe(status);}
  for(const data of[{updated:true},{actorId:alias,bookId:edition,editionId:edition,has_audiobook:true,updated:true},{actorId:actor,bookId:edition,editionId:edition,has_audiobook:false,updated:true}]){rpc.mockResolvedValueOnce({data,error:null});expect((await PATCH(request({has_audiobook:true}),params)).status).toBe(503);}
  vi.mocked(checkRouteRateLimit).mockResolvedValue(false);expect((await PATCH(request({has_audiobook:true}),params)).status).toBe(429);
});
