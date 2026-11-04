import {afterEach,expect,it,vi} from 'vitest';
import {createTranslator} from 'next-intl';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';
import {GET as book} from '@/app/(app)/share/book/[id]/route';
import {GET as finished} from '@/app/(app)/share/finished/[userId]/[bookId]/route';
import {GET as shelf} from '@/app/(app)/share/shelf/[userId]/route';
import {GET as quote} from '@/app/(app)/share/quote/[id]/route';
import {GET as review} from '@/app/(app)/share/review/[id]/route';
import {GET as challenge} from '@/app/(app)/share/challenge/[id]/route';
import {GET as writing} from '@/app/(app)/share/writing-challenge/[id]/route';
import {shareCardPath} from '@/lib/share-card-path';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),tree:null as any,options:null as any}));
const catalogs={en,fr,de},id='10000000-0000-4000-8000-000000000097',owner='20000000-0000-4000-8000-000000000097',edition={id,title:'Canonical edition',author_name:'Author',cover_url:null};
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:mocks.auth}}),createServiceClient:()=>({rpc:mocks.rpc})}));
vi.mock('next-intl/server',()=>({getLocale:async()=>'fr',getTranslations:async({locale,namespace}:{locale:keyof typeof catalogs;namespace:string})=>createTranslator({locale,messages:catalogs[locale],namespace:namespace as never,onError:error=>{throw error;}})}));
const imageFactory=vi.hoisted(()=>()=>({ImageResponse:class extends Response{constructor(tree:unknown,options:any){super('PNG fixture',{headers:options.headers});mocks.tree=tree;mocks.options=options;}}}));
vi.mock('@vercel/og',imageFactory);
vi.mock('next/og',imageFactory);
afterEach(()=>{vi.clearAllMocks();});
function setup(){mocks.auth.mockResolvedValue({data:{user:{id:owner}}});mocks.rpc.mockImplementation(async(_name:string,args:{p_kind:string})=>({error:null,data:args.p_kind==='book'?edition:{title:'Real challenge',book:edition,reader:{display_name:'Reader',avatar_url:null},review:null,books:[edition],content:'Actual content',rating:4,progress:{booksFinished:1,pagesRead:300},completed:false,submissionCount:1}}));}
for(const locale of['en','fr','de']as const)it('renders every legacy share card in '+locale+' with a private cache policy and actual progress',async()=>{
 setup();const routes=[book,finished,shelf,quote,review,challenge,writing];
 for(const route of routes){const response=await(route as any)(new Request('https://app.test/share?locale='+locale+'&userId='+owner),{params:{id,userId:owner,bookId:id}});expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(mocks.options).toMatchObject({width:1200,height:630});const text=JSON.stringify(mocks.tree);expect(text).not.toContain('I completed the');if(route===challenge)expect(text).toContain(catalogs[locale].shareCards.challengeProgress);if(route===finished)expect(text).toContain('Canonical edition');}
});
it('keeps catalog cards independent of the cookie account and uses canonical metadata',async()=>{setup();await book(new Request('https://app.test/share?locale=en'),{params:{id}});expect(mocks.auth).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith('share_card_snapshot',{p_kind:'book',p_target:id,p_owner:null,p_actor:null});expect(JSON.stringify(mocks.tree)).not.toContain('Reader');});
it('rejects malformed targets/locales before reading or rendering and never fabricates missing images',async()=>{setup();for(const url of['?locale=xx','?locale=','?locale=en']){const response=await book(new Request('https://app.test/share'+url),{params:{id:url==='?locale=en'?'bad':id}});expect(response.status).toBe(400);}expect(mocks.rpc).not.toHaveBeenCalled();mocks.rpc.mockResolvedValue({data:null,error:null});expect((await quote(new Request('https://app.test/share'),{params:{id}})).status).toBe(404);mocks.rpc.mockResolvedValue({data:null,error:{code:'08006'}});const failure=await shelf(new Request('https://app.test/share'),{params:{userId:owner}});expect(failure.status).toBe(503);expect(failure.headers.get('Cache-Control')).toBe('private, no-store');});
it('binds personal snapshots to the authenticated viewer and versions explicit locale URLs',async()=>{setup();await finished(new Request('https://app.test/share?locale=de'),{params:{userId:owner,bookId:id}});expect(mocks.rpc).toHaveBeenCalledWith('share_card_snapshot',{p_kind:'finished',p_target:id,p_owner:owner,p_actor:owner});expect(shareCardPath('finished',owner+'/'+id,'de')).toBe('/share/finished/'+owner+'/'+id+'?v=2&locale=de');});
