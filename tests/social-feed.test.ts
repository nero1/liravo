import {beforeEach,expect,it,vi} from 'vitest';
import {GET} from '@/app/api/feed/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {encodeCursor,decodeCursor} from '@/lib/pagination';
import {socialFeedItem} from '@/lib/social-feed-contracts';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
const actor='00000000-0000-4000-8000-000000000001',writer='00000000-0000-4000-8000-000000000002',book='00000000-0000-4000-8000-000000000003',review='00000000-0000-4000-8000-000000000004',at='2026-10-28T00:00:00.123456+00:00';
const item={type:'review',id:'rv-'+review,reviewId:review,timestamp:at,userId:writer,user:{id:writer,username:'fixture',display_name:'Fixture reviewer',avatar_url:null},book:{id:book,title:'Fixture book',author_name:'Fixture author',cover_url:null},rating:4,reviewType:'short',excerpt:'Hidden spoiler fixture',hasSpoilers:true,wantToRead:false};
const rpc=vi.fn();
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);vi.mocked(createServiceClient).mockReturnValue({rpc} as never);rpc.mockResolvedValue({data:[item],error:null});});
it('binds the canonical feed query to the authenticated viewer',async()=>{
  const response=await GET(new Request('https://app.test/api/feed'));expect(response.status).toBe(200);expect(await response.json()).toEqual({items:[item],nextCursor:null});expect(rpc).toHaveBeenCalledWith('read_social_feed',{p_user_id:actor,p_at:null,p_id:null,p_kind:null,p_limit:20});
  vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test/api/feed'))).status).toBe(401);expect(rpc).toHaveBeenCalledTimes(1);
});
it('retains microseconds and kind when advancing a combined-source page',async()=>{
  rpc.mockResolvedValueOnce({data:Array.from({length:21},()=>item),error:null});const page=await(await GET(new Request('https://app.test/api/feed'))).json();expect(page.items).toHaveLength(20);expect(decodeCursor(page.nextCursor)).toEqual({at,id:review,kind:'rv'});
  await GET(new Request('https://app.test/api/feed?cursor='+page.nextCursor));expect(rpc).toHaveBeenLastCalledWith('read_social_feed',expect.objectContaining({p_at:at,p_id:review,p_kind:'rv'}));
});
it('rejects invalid cursors before querying and reports dependency failures without false emptiness',async()=>{
  for(const cursor of ['invalid',encodeCursor({at,id:review})])expect((await GET(new Request('https://app.test/api/feed?cursor='+cursor))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  for(const result of [{data:null,error:{code:'08006'}},{data:[{...item,user:null}],error:null},{data:[{...item,timestamp:'not-a-date'}],error:null}]){rpc.mockResolvedValueOnce(result);expect((await GET(new Request('https://app.test/api/feed'))).status).toBe(503);}
});
function nativeItem(value:unknown){
  const exports:{FeedItem?:(props:unknown)=>unknown}={};
  const code=ts.transpileModule(readFileSync('mobile/components/social/FeedItem.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(code,{exports,Intl,Date,require:(name:string)=>{
    if(name==='react')return {useState:()=>[false,vi.fn()]};
    if(name==='react/jsx-runtime')return {jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})};
    if(name==='react-native')return {View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity'};
    if(name==='expo-image')return {Image:'Image'};if(name==='expo-router')return {useRouter:()=>({push:vi.fn()})};
    if(name==='@/hooks/useTranslations')return {useTranslations:()=>({locale:'fr',t:(key:string)=>key})};
    for(const component of ['Avatar','StarRating','ReviewWantToReadButton'])if(name.endsWith('/'+component))return {[component]:component};
    throw new Error('Unexpected dependency: '+name);
  }});return exports.FeedItem!({item:value});
}
it('renders the actual native review contract and keeps spoilers hidden',()=>{
  const tree=nativeItem(socialFeedItem.parse(item)),rendered=JSON.stringify(tree);expect(rendered).toContain('Fixture reviewer');expect(rendered).toContain('Fixture book');expect(rendered).not.toContain(item.excerpt);expect(rendered).toContain('spoilers');expect(rendered).toContain('"reviewId":"'+review+'"');
});
it('renders native shelf activity without expecting a nonexistent actor or review object',()=>{
  const shelf={...item,type:'shelf_book',shelf:{name:'Private custom name',default_type:'want_to_read'},finishedAt:null};const rendered=JSON.stringify(nativeItem(socialFeedItem.parse(shelf)));expect(rendered).toContain('wants');expect(rendered).not.toContain('ReviewWantToReadButton');
});
