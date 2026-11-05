import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {POST} from '@/app/api/books/click/route';
import {buildAffiliateLinks,getAudibleLink} from '@/services/books';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkRouteRateLimit} from '@/lib/rate-limit';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>{throw new Error('Store links must not use stale cache');},REDIS_KEYS:{},REDIS_TTL:{}}));
const actor='00000000-0000-4000-8000-000000000001',bookId='00000000-0000-4000-8000-000000000002',storeId='00000000-0000-4000-8000-000000000003',clickId='00000000-0000-4000-8000-000000000004';
const book={id:bookId,title:'Fixture & book',isbn_13:'9780140328721',isbn_10:null,has_audiobook:true} as never;
let stores:Record<string,unknown>[],storeError:unknown=null;
const rpc=vi.fn(),from=vi.fn();
beforeEach(()=>{
  vi.resetAllMocks();storeError=null;stores=[{id:storeId,name:'Fixture store',countries:['NG'],url_template:'https://store.example.test/?isbn={isbn}&tag={tag}&title={title}&again={isbn}',affiliate_tag:'fixture&tag',priority:1,is_non_affiliate:false,updated_at:'2026-10-28T00:00:00.123456+00:00'}];
  vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);vi.mocked(checkRouteRateLimit).mockResolvedValue(true);
  from.mockImplementation(table=>{const query={select:()=>query,eq:()=>query,order:async()=>({data:stores,error:storeError}),maybeSingle:async()=>({data:book,error:null}),single:async()=>({data:table==='users'?{country:'NG',preferred_locale:'en'}:book,error:null})};return query;});
  vi.mocked(createServiceClient).mockReturnValue({from,rpc} as never);rpc.mockResolvedValue({data:{ok:true,clickId},error:null});
});
afterEach(()=>vi.unstubAllEnvs());
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://app.test/api/books/click',{method:'POST',headers:{'Idempotency-Key':'fixture-click-intent',...headers},body:JSON.stringify(body)});
it('uses the explicit country and safely expands every configured placeholder',async()=>{
  const [link]=await buildAffiliateLinks(book,'NG','en'),url=new URL(link.url);expect(link.storeId).toBe(storeId);expect(link.country).toBe('NG');expect(link.linkId).toMatch(new RegExp('^'+storeId+':[a-f0-9]{64}$'));expect(url.searchParams.get('tag')).toBe('fixture&tag');expect(url.searchParams.get('title')).toBe('Fixture & book');expect(url.searchParams.get('again')).toBe('9780140328721');expect(link.storeVersion).toContain('.123456');
});
it('detects changed configurations immediately and rejects insecure or unavailable stores',async()=>{
  const first=(await buildAffiliateLinks(book,'NG'))[0];stores[0].affiliate_tag='rotated';const second=(await buildAffiliateLinks(book,'NG'))[0];expect(second.linkId).not.toBe(first.linkId);
  stores[0].url_template='javascript:alert(1)';await expect(buildAffiliateLinks(book,'NG')).rejects.toThrow('configuration unavailable');storeError={code:'08006'};await expect(buildAffiliateLinks(book,'NG')).rejects.toThrow('stores unavailable');
});
it('uses a non-affiliate fallback and preserves Audible search tags and market',async()=>{
  stores=[];const [fallback]=await buildAffiliateLinks(book,undefined,'fr');expect(fallback).toMatchObject({country:'FR',isAffiliate:false,storeId:null});expect(fallback.linkId).toMatch(/^worldcat:/);
  vi.stubEnv('AUDIBLE_AFFILIATE_FR','fixture&partner');const audio=getAudibleLink(book,'fr','NG')!,url=new URL(audio.url);expect(url.hostname).toBe('www.audible.fr');expect(url.searchParams.get('keywords')).toBe('Fixture & book');expect(url.searchParams.get('tag')).toBe('fixture&partner');expect(audio.isAffiliate).toBe(true);expect(getAudibleLink({...book as object,has_audiobook:false} as never)).toBeNull();
});
it('records canonical server metadata and returns a validated durable receipt',async()=>{
  const [link]=await buildAffiliateLinks(book,'NG','en');const response=await POST(request({bookId,linkId:link.linkId}));expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,clickId});expect(rpc).toHaveBeenCalledWith('record_book_link_click',expect.objectContaining({p_user_id:actor,p_book_id:bookId,p_key:'fixture-click-intent',p_link:expect.objectContaining({country:'NG',isAffiliate:true,storeId})}));
});
it('rejects client-supplied flags, invalid identities and account switches before mutation',async()=>{
  const linkId=storeId+':'+'a'.repeat(64);
  for(const [body,headers,status] of [[{bookId,linkId,isAffiliate:false},{},400],[{bookId,linkId:'unknown'},{},400],[{bookId,linkId},{'X-Liravo-Actor':storeId},409]] as [unknown,Record<string,string>,number][])expect((await POST(request(body,headers))).status).toBe(status);expect(rpc).not.toHaveBeenCalled();
});
it('supports receipt replay after store changes and never acknowledges storage failures',async()=>{
  const linkId=storeId+':'+'a'.repeat(64);expect((await POST(request({bookId,linkId}))).status).toBe(200);expect(rpc).toHaveBeenLastCalledWith('record_book_link_click',expect.objectContaining({p_link:null}));
  for(const [code,status] of [['P1001',409],['P1005',404],['08006',503]] as const){rpc.mockResolvedValueOnce({data:null,error:{code}});expect((await POST(request({bookId,linkId}))).status).toBe(status);}
  rpc.mockResolvedValueOnce({data:{ok:true},error:null});expect((await POST(request({bookId,linkId}))).status).toBe(503);
});

it('omits ISBN-dependent stores for ISBN-less editions while retaining encoded title searches',async()=>{
  const title='A title & / question?',edition={title,isbn_13:null,isbn_10:null};
  stores.push({...stores[0],id:'00000000-0000-4000-8000-000000000005',name:'Title search',url_template:'https://titles.example.test/search?q={title}&tag={tag}'});
  const links=await buildAffiliateLinks(edition,'NG');expect(links).toHaveLength(1);expect(links[0].name).toBe('Title search');expect(new URL(links[0].url).searchParams.get('q')).toBe(title);
  stores.pop();const [fallback]=await buildAffiliateLinks(edition,'NG');expect(fallback.storeId).toBeNull();expect(new URL(fallback.url).searchParams.get('q')).toBe(title);
});
it('retains ISBN-10-only searches, region filtering and fallback identity',async()=>{
  const edition={title:'ISBN ten edition',isbn_13:null,isbn_10:'0140328726'};
  const [store]=await buildAffiliateLinks(edition,'NG');expect(new URL(store.url).searchParams.get('isbn')).toBe('0140328726');
  const [fallback]=await buildAffiliateLinks(edition,'DE');expect(fallback.country).toBe('DE');expect(fallback.linkId).toMatch(/^worldcat:/);expect(new URL(fallback.url).searchParams.get('q')).toBe('0140328726');
});
