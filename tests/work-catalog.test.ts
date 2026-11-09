import {beforeEach,expect,it,vi} from 'vitest';
import {GET} from '@/app/api/works/[id]/route';
import {POST} from '@/app/api/works/[id]/editions/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {CatalogIdentityError,discoverOpenLibraryEditions,getWorkCatalog,searchOpenLibrary,storeCatalogBook} from '@/services/books';
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn()}));
vi.mock('@/services/books',()=>({CatalogIdentityError:class extends Error{},getWorkCatalog:vi.fn(),searchOpenLibrary:vi.fn(),discoverOpenLibraryEditions:vi.fn(),storeCatalogBook:vi.fn()}));
const workId='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',bookId='00000000-0000-4000-8000-000000000003';
const catalog={work:{id:workId,title:'A work',author_name:'An author',open_library_id:'/works/OL1W',merged_into:null,created_at:'2026-01-01T00:00:00Z'},editions:[],nextCursor:null,statistics:{ratings_count:0,average_rating:null,readers_count:0}};
const request=(body:unknown={},headers:Record<string,string>={})=>new Request('https://app.test/api/works/'+workId+'/editions',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);vi.mocked(checkRouteRateLimit).mockResolvedValue(true);vi.mocked(getWorkCatalog).mockResolvedValue(catalog);vi.mocked(discoverOpenLibraryEditions).mockResolvedValue({books:[],skipped:0,nextOffset:null});});
it('requires authentication and validates work and local edition cursors',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test'),{params:Promise.resolve({id:workId})})).status).toBe(401);expect((await POST(request(),{params:Promise.resolve({id:workId})})).status).toBe(401);
  vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);expect((await GET(new Request('https://app.test'),{params:Promise.resolve({id:'invalid'})})).status).toBe(400);
  expect((await GET(new Request('https://app.test?cursor=invalid'),{params:Promise.resolve({id:workId})})).status).toBe(400);expect(getWorkCatalog).not.toHaveBeenCalled();
  expect((await GET(new Request('https://app.test'),{params:Promise.resolve({id:workId})})).status).toBe(200);
});
it('rejects cursor reuse for another work and cross-account requests before provider calls',async()=>{
  const cursor=Buffer.from(JSON.stringify({workId:bookId,offset:20})).toString('base64url');expect((await POST(request({cursor}),{params:Promise.resolve({id:workId})})).status).toBe(400);
  expect((await POST(request({}, {'X-Liravo-Actor':bookId}),{params:Promise.resolve({id:workId})})).status).toBe(409);expect(discoverOpenLibraryEditions).not.toHaveBeenCalled();
});
it('enforces provider lookup quotas and returns unavailable sources without fabricating editions',async()=>{
  vi.mocked(checkRouteRateLimit).mockResolvedValue(false);expect((await POST(request(),{params:Promise.resolve({id:workId})})).status).toBe(429);expect(discoverOpenLibraryEditions).not.toHaveBeenCalled();
  vi.mocked(checkRouteRateLimit).mockResolvedValue(true);vi.mocked(getWorkCatalog).mockResolvedValue({...catalog,work:{...catalog.work,open_library_id:null}});expect((await POST(request(),{params:Promise.resolve({id:workId})})).status).toBe(409);
});
it('advances bounded provider cursors while retaining valid records and exposing conflicts',async()=>{
  const books=[{title:'First',author_name:'Author'},{title:'Second',author_name:'Author'}] as never;
  vi.mocked(discoverOpenLibraryEditions).mockResolvedValue({books,skipped:1,nextOffset:20});vi.mocked(storeCatalogBook).mockResolvedValueOnce({id:bookId,work_id:workId} as never).mockRejectedValueOnce(new CatalogIdentityError('Conflict'));
  const response=await POST(request(),{params:Promise.resolve({id:workId})}),data=await response.json();expect(response.status).toBe(200);expect(data.editions).toEqual([{id:bookId,work_id:workId}]);expect(data.skipped).toBe(2);expect(data.providerComplete).toBe(false);
  expect(JSON.parse(Buffer.from(data.providerCursor,'base64url').toString())).toEqual({workId,offset:20});
});
it('does not advance the page when persistence fails transiently',async()=>{
  vi.mocked(discoverOpenLibraryEditions).mockResolvedValue({books:[{title:'First',author_name:'Author'}] as never,skipped:0,nextOffset:20});vi.mocked(storeCatalogBook).mockRejectedValue(new Error('Database unavailable'));
  const response=await POST(request(),{params:Promise.resolve({id:workId})});expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('providerCursor');
});

it('resolves Google-only work identity through an exact edition ISBN before discovery',async()=>{
  const resolved={...catalog,work:{...catalog.work,id:bookId},editions:[{id:actor,work_id:bookId,isbn_13:'9780306406157'}] as never};
  vi.mocked(getWorkCatalog).mockResolvedValueOnce({...catalog,work:{...catalog.work,open_library_id:null},editions:[{id:actor,work_id:workId,isbn_13:'9780306406157'}] as never}).mockResolvedValue(resolved);
  vi.mocked(searchOpenLibrary).mockResolvedValue([{open_library_work_id:'/works/OL1W',isbn_13:'9780306406157',title:'Exact edition',author_name:'An author'}] as never);
  vi.mocked(storeCatalogBook).mockResolvedValue({id:actor,work_id:bookId} as never);
  const response=await POST(request(),{params:Promise.resolve({id:workId})}),data=await response.json();expect(response.status).toBe(200);expect(data.work.id).toBe(bookId);
  expect(vi.mocked(searchOpenLibrary).mock.calls[0].slice(0,2)).toEqual(['9780306406157',1]);
  expect(vi.mocked(discoverOpenLibraryEditions).mock.calls[0][0].open_library_id).toBe('/works/OL1W');
});
