import {beforeEach,expect,it,vi} from 'vitest';
import {parseGoodreadsImport} from '@/lib/goodreads-import';
import {GET} from '@/app/api/users/export/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {createServiceClient} from '@/lib/supabase/server';
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:vi.fn(async()=>({allowed:true}))}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
const actor='00000000-0000-4000-8000-000000000068',rpc=vi.fn(),entry={added_at:'2026-10-28',finished_at:null,progress_pages:160,progress_percent:40,books:{title:'=HYPERLINK("https://example.test")',author_name:'Auteur',isbn_13:'9780306406157',isbn_10:'0306406152',language:'fr',format:'hardcover',publisher:'Éditeur',page_count:400,published_year:2020},shelves:{name:'Reading',default_type:'currently_reading'}};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:true} as never);vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);vi.mocked(createServiceClient).mockReturnValue({rpc} as never);rpc.mockResolvedValue({data:{profile:{id:actor},reading_history:[entry]},error:null});});
it('exports canonical edition ISBNs and recorded progress, neutralizing spreadsheet formulas',async()=>{
  const response=await GET(new Request('https://app.test/api/users/export?format=csv')),csv=await response.text();
  expect(response.status).toBe(200);expect(csv).toContain('"ISBN13","ISBN","Language"');expect(csv).toContain('"9780306406157","0306406152","fr"');expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');expect(csv).toContain('"160","40"');
  expect(parseGoodreadsImport(csv)).toMatchObject({skipped:0,rows:[{book:{isbn_13:'9780306406157',language:'fr',format:'hardcover',page_count:400,publisher:'Éditeur'},shelf:'currently_reading'}]});
  expect(response.headers.get('cache-control')).toBe('private, no-store');expect(rpc).toHaveBeenCalledWith('account_data_export',{p_user_id:actor});
});
it('never returns a successful empty or partial export on a database failure',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'42703'}});const response=await GET(new Request('https://app.test/api/users/export'));expect(response.status).toBe(503);expect(response.headers.get('content-disposition')).toBeNull();
});
it('requires an authenticated account and rejects unsupported export formats before querying',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test/api/users/export'))).status).toBe(401);
  vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);expect((await GET(new Request('https://app.test/api/users/export?format=sql'))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});

it('enforces the account quota without pooling users behind unknown ingress',async()=>{
  await GET(new Request('https://app.test/api/users/export'));expect(checkCriticalRateLimit).toHaveBeenCalledTimes(1);expect(checkCriticalRateLimit).toHaveBeenCalledWith('export:user:'+actor);
  vi.mocked(checkCriticalRateLimit).mockResolvedValue({allowed:false} as never);expect((await GET(new Request('https://app.test/api/users/export'))).status).toBe(429);
});
