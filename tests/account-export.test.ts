import {beforeEach,expect,it,vi}from'vitest';
import {parseGoodreadsImport}from'@/lib/goodreads-import';
import {GET,POST}from'@/app/api/users/export/route';
import {getCurrentUser}from'@/lib/auth/getCurrentUser';
import {checkCriticalRateLimit,checkRouteRateLimit}from'@/lib/rate-limit';
import {createServiceClient}from'@/lib/supabase/server';
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:vi.fn(),checkRouteRateLimit:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
const actor='00000000-0000-4000-8000-000000000068',id='00000000-0000-4000-8000-000000000069',rpc=vi.fn(),single=vi.fn(),entry={added_at:'2026-10-28',finished_at:null,progress_pages:160,progress_percent:'40',books:{title:'=HYPERLINK("https://example.test")',author_name:'Auteur',isbn_13:'9780306406157',isbn_10:'0306406152',language:'fr',format:'hardcover',publisher:'Éditeur',page_count:400,published_year:2020},shelves:{name:'Reading',default_type:'currently_reading'}};
const job=()=>({id,actorId:actor,format:'csv',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),datasets:[{dataset:'reading_history',single:false}]});
const start=()=>POST(new Request('https://app.test/api/users/export',{method:'POST',headers:{'Idempotency-Key':'export-fixture-key'},body:JSON.stringify({format:'csv'})}));
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('AUTH_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64'));vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:true}as never);vi.mocked(checkRouteRateLimit).mockResolvedValue(true);vi.mocked(getCurrentUser).mockResolvedValue({id:actor}as never);const query={select:()=>query,eq:()=>query,single};vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>query}as never);rpc.mockImplementation(async(name:string)=>({data:name==='start_account_export'?job():{actorId:actor,jobId:id,dataset:'reading_history',records:[{key:{id},data:entry}],complete:true,nextKey:null},error:null}));single.mockImplementation(async()=>({data:{...job(),user_id:actor,created_at:job().createdAt,expires_at:job().expiresAt},error:null}));});
it('exports canonical edition ISBNs and progress in CSV chunks with spreadsheet formula protection',async()=>{
 const started=await start(),{cursor}=await started.json(),response=await GET(new Request('https://app.test/api/users/export?cursor='+encodeURIComponent(cursor))),chunk=await response.json(),csv=chunk.text;
 expect(response.status).toBe(200);expect(chunk).toMatchObject({actorId:actor,jobId:id,complete:true,nextCursor:null});expect(csv).toContain('"ISBN13","ISBN","Language"');expect(csv).toContain('"9780306406157","0306406152","fr"');expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');expect(csv).toContain('"160","40"');
 expect(parseGoodreadsImport(csv)).toMatchObject({skipped:0,rows:[{book:{isbn_13:'9780306406157',language:'fr',format:'hardcover',page_count:400,publisher:'Éditeur'},shelf:'currently_reading'}]});expect(response.headers.get('cache-control')).toBe('private, no-store');expect(rpc).toHaveBeenCalledWith('account_export_page',expect.objectContaining({p_user:actor,p_job:id,p_limit:500}));
});
it('returns a failure instead of an empty or partial success on database errors',async()=>{rpc.mockResolvedValue({data:null,error:{code:'42703'}});expect((await start()).status).toBe(503);});
it('requires authentication and rejects unsigned or malformed cursors before querying',async()=>{vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test/api/users/export'))).status).toBe(401);vi.mocked(getCurrentUser).mockResolvedValue({id:actor}as never);expect((await GET(new Request('https://app.test/api/users/export?cursor=bad'))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
it('separates export creation quotas from chunk quotas',async()=>{await start();expect(checkCriticalRateLimit).toHaveBeenCalledWith('export:start:'+actor);vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:false}as never);expect((await start()).status).toBe(429);expect(checkRouteRateLimit).not.toHaveBeenCalled();});

it('rejects an account switch and an oversized creation body before database work',async()=>{
 expect((await POST(new Request('https://app.test/api/users/export',{method:'POST',headers:{'X-Liravo-Actor':'other-reader'},body:'{"format":"json"}'}))).status).toBe(409);
 expect((await POST(new Request('https://app.test/api/users/export',{method:'POST',body:'x'.repeat(1000)}))).status).toBe(413);expect(rpc).not.toHaveBeenCalled();
});
