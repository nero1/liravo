import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {GET} from '@/app/api/ai/recommendations/route';
import {fetchWithRetry} from '@/lib/retry';
const state=vi.hoisted(()=>({locale:'fr',unavailable:false,cache:new Map<string,string>()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>({id:'00000000-0000-4000-8000-000000000067'})}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:async()=>true}));
vi.mock('@/lib/locks',async original=>({...await original<typeof import('@/lib/locks')>(),withRedisLock:async(_key:string,_seconds:number,work:()=>Promise<unknown>)=>work()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:state.unavailable?null:{genres:['Fiction'],preferred_locale:state.locale},error:state.unavailable?{message:'Unavailable'}:null})})})})})}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>({get:async(key:string)=>state.cache.get(key)??null,set:async(key:string,value:string)=>{state.cache.set(key,value);}})}));
vi.mock('@/lib/retry',()=>({fetchWithRetry:vi.fn()}));
beforeEach(()=>{state.cache.clear();state.locale='fr';state.unavailable=false;vi.stubEnv('DEEPSEEK_API_KEY','isolated-key');vi.mocked(fetchWithRetry).mockReset();});
it('uses the account locale for generated reasons and never reuses another locale’s cached recommendations',async()=>{
  vi.mocked(fetchWithRetry).mockImplementation(async(_url,options)=>{
    const body=JSON.parse(options!.body as string),prompt=body.messages[1].content;
    const reason=prompt.includes('French')?'Convient à votre humeur.':'Passt zu deiner Stimmung.';
    return Response.json({choices:[{message:{content:JSON.stringify(Array.from({length:5},(_,index)=>({title:'Original title '+index,author:'Original author',reason})))}}]});
  });
  const request=()=>new NextRequest('https://app.test/api/ai/recommendations?mood=Cozy');
  const french=await(await GET(request())).json();expect(french.recommendations[0].reason).toBe('Convient à votre humeur.');
  state.locale='de';const german=await(await GET(request())).json();expect(german.recommendations[0].reason).toBe('Passt zu deiner Stimmung.');
  expect((await(await GET(request())).json()).cached).toBe(true);state.locale='fr';expect((await(await GET(request())).json()).cached).toBe(true);
  expect(fetchWithRetry).toHaveBeenCalledTimes(2);expect(state.cache.size).toBe(2);
  vi.unstubAllEnvs();
});
it('fails without generating generic recommendations when profile preferences cannot be read',async()=>{
  state.unavailable=true;expect((await GET(new NextRequest('https://app.test/api/ai/recommendations'))).status).toBe(503);expect(fetchWithRetry).not.toHaveBeenCalled();vi.unstubAllEnvs();
});
