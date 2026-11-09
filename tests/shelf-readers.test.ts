import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {getShelfCatalog,getShelfDetail} from '@/lib/shelf-catalog';
import {GET as catalog} from '@/app/api/shelves/route';
import {GET as detail} from '@/app/api/shelves/[id]/route';
const actor='00000000-0000-4000-8000-000000000094',other='00000000-0000-4000-8000-000000000095',shelf='00000000-0000-4000-8000-000000000096',book='00000000-0000-4000-8000-000000000097',at='2026-11-04T00:00:00.123456+00:00';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({rpc:state.rpc})}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>({id:'00000000-0000-4000-8000-000000000094'})}));
beforeEach(()=>vi.clearAllMocks());
it('keeps full shelf totals and selection counts while paging default/custom ties with exact timestamp precision',async()=>{
 state.rpc.mockResolvedValueOnce({data:{shelves:Array.from({length:51},()=>({id:shelf,user_id:actor,created_at:at,is_default:false,contains_book:true})),total:105,selectedTotal:75,reading:{}}});const page=await getShelfCatalog(actor,book);expect(page.shelves).toHaveLength(50);expect(page).toMatchObject({actorId:actor,bookId:book,total:105,selectedTotal:75});state.rpc.mockResolvedValueOnce({data:{shelves:[],total:105,selectedTotal:75,reading:{}}});await getShelfCatalog(actor,book,page.nextCursor);expect(state.rpc).toHaveBeenLastCalledWith('shelf_catalog_snapshot',expect.objectContaining({p_user:actor,p_book:book,p_default:false,p_at:at,p_id:shelf}));await expect(getShelfCatalog(other,book,page.nextCursor)).rejects.toMatchObject({status:400});await expect(getShelfCatalog(actor,null,page.nextCursor)).rejects.toMatchObject({status:400});
});
it('uses canonical edition cursor identities independently of the retained progress/history row',async()=>{
 const entry={id:other,book_id:book,source_book_id:shelf,book:{id:book}};state.rpc.mockResolvedValueOnce({data:{shelf:{id:shelf},books:Array.from({length:51},()=>({entry,at,id:book})),total:55}});const page=await getShelfDetail(actor,shelf);expect(page.books).toHaveLength(50);expect(page.books[0]).toEqual(entry);expect(page.total).toBe(55);expect(JSON.parse(Buffer.from(page.nextCursor!,'base64url').toString())).toEqual({actorId:actor,scope:'books.'+shelf,at,id:book});await expect(getShelfDetail(actor,other,page.nextCursor)).rejects.toMatchObject({status:400});
});
it('rejects stale actors, malformed queries and unavailable reads instead of exposing empty shelves',async()=>{
 expect((await catalog(new NextRequest('https://app.test/api/shelves',{headers:{'X-Liravo-Actor':other}}))).status).toBe(409);expect((await catalog(new NextRequest('https://app.test/api/shelves?bookId=invalid'))).status).toBe(400);expect((await detail(new Request('https://app.test?limit=0'),{params:Promise.resolve({id:shelf})})).status).toBe(400);state.rpc.mockResolvedValueOnce({error:{code:'XX000'}});expect((await catalog(new NextRequest('https://app.test/api/shelves'))).status).toBe(503);state.rpc.mockResolvedValueOnce({error:{code:'P1003'}});expect((await detail(new Request('https://app.test'),{params:Promise.resolve({id:shelf})})).status).toBe(403);
});
