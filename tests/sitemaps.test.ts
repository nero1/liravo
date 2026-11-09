import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({rpc:state.rpc})}));
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_APP_URL','https://books.example.test');vi.resetModules();state.rpc.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
it('advertises every index on the configured domain and returns bounded canonical XML pages',async()=>{
 const {sitemapIndexURLs,sitemapIndex,sitemapPage}=await import('@/lib/sitemaps');
 state.rpc.mockResolvedValue({data:2,error:null});expect(await sitemapIndexURLs()).toEqual(['https://books.example.test/sitemap.xml','https://books.example.test/sitemap-index/1.xml']);
 state.rpc.mockResolvedValue({data:[{kind:'books',first:'00000000-0000-0000-0000-000000000000',until:null}],error:null});const index=await(await sitemapIndex(0)).text();expect(index).toContain('https://books.example.test/sitemaps/static.xml');expect(index).not.toContain('/discover');
 const token=index.match(/sitemaps\/([A-Za-z0-9_-]+\.xml)/g)!.find(value=>!value.endsWith('static.xml'))!.slice(9);
 state.rpc.mockResolvedValue({data:[{id:'00000000-0000-4000-8000-000000000105',path:'/book/00000000-0000-4000-8000-000000000105',updated_at:'2026-11-05T00:00:00Z'}],error:null});const leaf=await sitemapPage(token);expect(leaf.status).toBe(200);expect(await leaf.text()).toContain('https://books.example.test/book/00000000-0000-4000-8000-000000000105');
});
it('reports failed or overflowing generation instead of returning truncated successful XML',async()=>{
 const {sitemapIndex,sitemapPage}=await import('@/lib/sitemaps');state.rpc.mockResolvedValue({data:null,error:{code:'08006'}});expect((await sitemapIndex(0)).status).toBe(503);expect((await sitemapPage('invalid.xml')).status).toBe(404);
 const token=Buffer.from(JSON.stringify({kind:'books',first:'00000000-0000-0000-0000-000000000000',until:null})).toString('base64url')+'.xml';state.rpc.mockResolvedValue({data:Array(5001).fill({}),error:null});expect((await sitemapPage(token)).status).toBe(503);
});
