import {beforeEach,expect,it,vi} from 'vitest';
import {getBookPasses,getBookChainRoster,getBookPassReceipt} from '@/lib/book-passing';
import {validBookPassReceipt} from '@/lib/client/book-pass-receipt';
import {GET,POST} from '@/app/api/pass-the-book/route';
import {POST as createChain} from '@/app/api/pass-the-book/chains/route';
import {POST as nominate} from '@/app/api/pass-the-book/chains/[id]/nominate/route';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {applyCommunityIntent} from '@/lib/community-intents';
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn(async()=>true)}));
const actor='00000000-0000-4000-8000-000000009001',chain='00000000-0000-4000-8000-000000009002',book='00000000-0000-4000-8000-000000009003',recipient='00000000-0000-4000-8000-000000009004',rpc=vi.fn();
const row=(i:number)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,created_at:'2026-11-04T00:00:00.123456+00:00'});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(createServiceClient).mockReturnValue({rpc}as never);vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'reader@example.test'});rpc.mockResolvedValue({data:{total:45,items:Array.from({length:21},(_,i)=>row(i))},error:null});});
it('pages complete catalogs with precision-preserving owned scope cursors',async()=>{
 const first=await getBookPasses(actor,'sent');expect(first.items).toHaveLength(20);expect(first.total).toBe(45);const cursor=JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString());expect(cursor.at).toBe('2026-11-04T00:00:00.123456+00:00');await getBookPasses(actor,'sent',first.nextCursor);expect(rpc).toHaveBeenLastCalledWith('book_pass_catalog_snapshot',expect.objectContaining({p_at:cursor.at,p_id:cursor.id}));
 await expect(getBookPasses(recipient,'sent',first.nextCursor)).rejects.toMatchObject({status:400});await expect(getBookPasses(actor,'received',first.nextCursor)).rejects.toMatchObject({status:400});
});
it('binds roster continuation to the chain and preserves tied positions by ID',async()=>{
 rpc.mockResolvedValue({data:{total:45,nodes:Array.from({length:21},(_,i)=>({...row(i),position:2}))},error:null});const first=await getBookChainRoster(actor,chain);expect(first.nodes).toHaveLength(20);await getBookChainRoster(actor,chain,first.nextCursor);expect(rpc).toHaveBeenLastCalledWith('book_chain_roster_snapshot',expect.objectContaining({p_position:2,p_id:row(19).id}));await expect(getBookChainRoster(actor,book,first.nextCursor)).rejects.toMatchObject({status:400});await expect(getBookChainRoster(actor,'bad')).rejects.toMatchObject({status:400});
});
it('keeps the existing received/sent arrays while exposing complete cursor metadata',async()=>{
 const response=await GET(new Request('https://app.test/api/pass-the-book'));expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(await response.json()).toMatchObject({actorId:actor,receivedTotal:45,sentTotal:45});expect((await GET(new Request('https://app.test/api/pass-the-book?scope=bad'))).status).toBe(400);rpc.mockResolvedValue({data:null,error:{code:'08006'}});expect((await GET(new Request('https://app.test/api/pass-the-book?scope=sent'))).status).toBe(503);
});
it('uses the atomic owned chain wrapper and preserves existing valid create/nomination bodies',async()=>{
 const request=(body:unknown,owner=actor)=>new Request('https://app.test/pass',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'book-passing090-owned','X-Liravo-Actor':owner},body:JSON.stringify(body)});
 rpc.mockResolvedValue({data:{actorId:actor,chainId:chain,chain:{id:chain,book_id:book,creator_id:actor}},error:null});expect((await createChain(request({book_id:book,note:'  Note  '}))).status).toBe(201);expect(rpc).toHaveBeenLastCalledWith('apply_book_chain_intent',expect.objectContaining({p_action:'chain_create',p_target:book,p_payload:{note:'  Note  '}}));
 expect((await nominate(request({nominee_id:recipient}),{params:{id:chain}})).status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('apply_book_chain_intent',expect.objectContaining({p_action:'chain_nominate',p_target:chain,p_payload:{nominee_id:recipient,note:null}}));expect((await createChain(request({book_id:book},recipient))).status).toBe(409);expect((await nominate(request({nominee_id:recipient}),{params:{id:'bad'}})).status).toBe(400);expect((await POST(request(null))).status).toBe(400);
 await applyCommunityIntent(request({}),actor,'report_review',chain,{status:'approved'});expect(rpc).toHaveBeenLastCalledWith('apply_community_intent',expect.anything());
});
it('recovers only the authenticated owner’s exact action receipt',async()=>{
 rpc.mockResolvedValue({data:{actorId:actor,pass:{id:book,sender_id:actor}},error:null});expect(await getBookPassReceipt(actor,'book_passes','book-passing090-owned')).toMatchObject({actorId:actor});await expect(getBookPassReceipt(actor,'bad','book-passing090-owned')).rejects.toMatchObject({status:400});rpc.mockResolvedValue({data:{actorId:recipient},error:null});await expect(getBookPassReceipt(actor,'book_passes','book-passing090-owned')).rejects.toMatchObject({status:503});
});
it('validates actor, selected edition, recipient and chain in owned acknowledgements',()=>{
 const pass={actorId:actor,pass:{id:chain,sender_id:actor,recipient_id:recipient,book_id:book,message:null}},body={book_id:book,recipient_id:recipient};expect(validBookPassReceipt(pass,actor,'book_passes',undefined,body)).toBe(true);expect(validBookPassReceipt(pass,recipient,'book_passes',undefined,body)).toBe(false);expect(validBookPassReceipt(pass,actor,'book_passes',undefined,{...body,book_id:chain})).toBe(false);expect(validBookPassReceipt({actorId:actor,chainId:chain,nomineeId:recipient,success:true,position:1},actor,'chain_nominate',book)).toBe(false);
});
