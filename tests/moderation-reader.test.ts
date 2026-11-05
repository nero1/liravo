import {beforeEach,expect,it,vi} from 'vitest';
import {NextResponse} from 'next/server';
import {readModeration,readModerationReceipt} from '@/lib/moderation-reader';
import {GET as reports,PATCH} from '@/app/api/moderation/reports/route';
import {GET as log} from '@/app/api/moderation/log/route';
import {POST} from '@/app/api/moderation/reports/[id]/action/route';
import {requireModerator,requireAdmin} from '@/lib/moderation';
import {createServiceClient} from '@/lib/supabase/server';
import {applyCommunityIntent} from '@/lib/community-intents';
vi.mock('@/lib/moderation',()=>({requireModerator:vi.fn(),requireAdmin:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/community-intents',()=>({applyCommunityIntent:vi.fn()}));
const actor='00000000-0000-4000-8000-000000008901',id='00000000-0000-4000-8000-000000008902',rpc=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireModerator).mockResolvedValue({userId:actor});vi.mocked(requireAdmin).mockResolvedValue({userId:actor});vi.mocked(createServiceClient).mockReturnValue({rpc}as never);rpc.mockResolvedValue({data:{total:42,rows:Array.from({length:21},(_,i)=>({item:{id,target:{content:'<p>Une lecture &amp; réflexions.</p><script>bad()</script>'}},at:'2026-11-04T12:00:00.123456+00:00',key:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}))},error:null});});
it('preserves cursor precision, status and actor and decodes safe bounded plain previews',async()=>{
 const first=await readModeration(actor,'reports');expect(first.total).toBe(42);expect(first.items).toHaveLength(20);expect(first.items[0]).toMatchObject({target:{content:'Une lecture & réflexions.'}});
 const cursor=JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString());expect(cursor).toMatchObject({actorId:actor,scope:'reports',status:'pending',at:'2026-11-04T12:00:00.123456+00:00'});
 await readModeration(actor,'reports',{cursor:first.nextCursor});expect(rpc).toHaveBeenLastCalledWith('moderation_catalog_snapshot',expect.objectContaining({p_at:cursor.at,p_id:cursor.key,p_offset:0}));
 for(const [owner,scope,options]of [[id,'reports',{cursor:first.nextCursor}],[actor,'log',{cursor:first.nextCursor}],[actor,'reports',{cursor:first.nextCursor,status:'removed'}]]as const)await expect(readModeration(owner,scope,options)).rejects.toMatchObject({status:400});
});
it('rejects invalid filters and pagination before storage and supports valid legacy pages',async()=>{
 for(const suffix of ['status=bogus','page=abc','page=0','page=1.2','page=10002','cursor=oops'])expect((await reports(new Request('https://app.test/reports?'+suffix))).status).toBe(400);
 expect(rpc).not.toHaveBeenCalled();expect((await reports(new Request('https://app.test/reports?page=2&status=all'))).status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('moderation_catalog_snapshot',expect.objectContaining({p_offset:20,p_status:'all'}));
});
it('retains the actual logs/action/moderator contract and private caching',async()=>{
 rpc.mockResolvedValue({data:{total:1,rows:[{item:{id,action:'approved',moderator:{username:'staff',display_name:'Staff'}},at:'2026-11-04T12:00:00Z',key:id}]},error:null});
 const response=await log(new Request('https://app.test/log'));expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(await response.json()).toMatchObject({actorId:actor,total:1,logs:[{action:'approved',moderator:{username:'staff'}}],nextCursor:null});
 vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({error:'Forbidden'},{status:403}));expect((await log(new Request('https://app.test/log'))).status).toBe(403);
});
it('exposes storage/role failures as errors rather than an empty queue',async()=>{
 for(const [code,status]of [['P1003',403],['08006',503]]as const){rpc.mockResolvedValue({data:null,error:{code}});expect((await reports(new Request('https://app.test/reports'))).status).toBe(status);}
});
it('returns owned report decisions, accepts the existing action payload and denies stale actors or empty patches',async()=>{
 vi.mocked(applyCommunityIntent).mockResolvedValue({report:{id,status:'approved',moderator_id:actor,moderator_note:null}});
 const request=(body:unknown,owner=actor)=>new Request('https://app.test/reports?reportId='+id,{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':owner,'Idempotency-Key':'moderation089-owned'},body:JSON.stringify(body)});
 const response=await POST(request({action:'approve'}),{params:{id}});expect(await response.json()).toMatchObject({actorId:actor,reportId:id,report:{id,status:'approved'}});
 expect((await POST(request({action:'remove'},id),{params:{id}})).status).toBe(409);expect((await POST(request({action:'remove'}),{params:{id:'bad'}})).status).toBe(400);expect((await PATCH(request({}))).status).toBe(400);
 expect(applyCommunityIntent).toHaveBeenCalledTimes(1);
});
it('recovers only an owned report receipt and distinguishes missing receipts',async()=>{
 rpc.mockResolvedValue({data:{report:{id,status:'removed'}},error:null});expect(await readModerationReceipt(actor,id,'moderation089-owned')).toMatchObject({actorId:actor,reportId:id});expect(rpc).toHaveBeenLastCalledWith('moderation_receipt_snapshot',{p_user:actor,p_report:id,p_key:'moderation089-owned'});
 rpc.mockResolvedValue({data:null,error:{code:'P1005'}});await expect(readModerationReceipt(actor,id,'moderation089-owned')).rejects.toMatchObject({status:404});
});
