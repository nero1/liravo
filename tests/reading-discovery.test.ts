import {beforeEach,expect,it,vi} from 'vitest';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {GET as quotes} from '@/app/api/quotes/route';
import {GET as debates,POST as createDebate} from '@/app/api/debates/route';
import {POST as vote} from '@/app/api/debates/[id]/vote/route';
import {POST as join} from '@/app/api/challenges/[id]/join/route';
import {decodeReadingCursor,getReadingQuotes} from '@/lib/reading-discovery';
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
const actor='00000000-0000-4000-8000-000000001001',target='00000000-0000-4000-8000-000000001002',rpc=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'reader@example.test'});vi.mocked(createServiceClient).mockReturnValue({rpc}as never);rpc.mockResolvedValue({data:{quotes:[],total:0},error:null});});
it('binds discovery cursors to actor, filter, catalog and roster',()=>{const cursor=Buffer.from(JSON.stringify({actorId:actor,scope:'quotes.owner.'+actor,at:'2026-10-30T00:00:00Z',id:target})).toString('base64url');expect(decodeReadingCursor(cursor,actor,'quotes.owner.'+actor)).toMatchObject({id:target});for(const [owner,scope]of [[target,'quotes.owner.'+actor],[actor,'quotes.book.'+target],[actor,'debates.active']])expect(()=>decodeReadingCursor(cursor,owner,scope)).toThrow('Invalid cursor');});
it('rejects changed accounts and malformed quote filters before database work',async()=>{for(const route of[vote,join])expect((await route(new Request('https://app.test/mutate',{method:'POST',headers:{'X-Liravo-Actor':target}}),{params:Promise.resolve({id:target})})).status).toBe(409);expect((await quotes(new Request('https://app.test/api/quotes?user_id=not-an-id')as never)).status).toBe(400);expect((await debates(new Request('https://app.test/api/debates?scope=unknown'))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
it('returns visible quote totals and fails closed on storage/visibility failures',async()=>{const response=await quotes(new Request('https://app.test/api/quotes')as never);expect(await response.json()).toMatchObject({quotes:[],total:0,actorId:actor,nextCursor:null});expect(rpc).toHaveBeenCalledWith('quote_catalog_snapshot',expect.objectContaining({p_user:actor,p_owner:actor,p_limit:20}));for(const [code,status]of[['XX000',503],['P1003',403],['P1005',404]]as const){rpc.mockResolvedValue({data:null,error:{code}});await expect(getReadingQuotes(actor,target)).rejects.toMatchObject({status});}});

it('rejects blank debate questions before reserving an intent or writing content',async()=>{const response=await createDebate(new Request('https://app.test/api/debates',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'blank-debate084'},body:JSON.stringify({book_id:target,question:'     '})})as never);expect(response.status).toBe(400);expect(await response.json()).toMatchObject({error:'Invalid body'});expect(rpc).not.toHaveBeenCalled();});
