import {beforeEach,expect,it,vi} from 'vitest';
import {POST} from '@/app/api/write/ai-feedback/route';
const state=vi.hoisted(()=>({locale:'fr',premium:true,error:false,call:vi.fn(),cache:new Map<string,string>()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>({id:'reader'})}));
vi.mock('@/lib/premium-access',()=>({hasPremiumAccess:async()=>state.premium}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:async()=>true}));
vi.mock('@/lib/ai-client',()=>({callAI:state.call}));
vi.mock('@/lib/supabase/server',()=>({createServiceClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>state.error?{error:{code:'08006'}}:{data:{preferred_locale:state.locale}}})})})})}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>({get:async(key:string)=>state.cache.get(key)??null,set:async(key:string,value:string)=>{state.cache.set(key,value);}})}));
const request=(text='A sufficiently long writing passage.')=>new Request('https://app.test/api/write/ai-feedback',{method:'POST',body:JSON.stringify({text,type:'grammar'})});
beforeEach(()=>{state.locale='fr';state.premium=true;state.error=false;state.cache.clear();state.call.mockReset();state.call.mockImplementation(async(_text:string,options:{system:string})=>({text:options.system.includes('French')?'Un commentaire en français.':'Ein deutsches Feedback.',provider:'deepseek'}));});
it('uses the saved locale in instructions and cache identity, retaining untrusted input boundaries and a request signal',async()=>{
 const french=await(await POST(request())).json();expect(french).toMatchObject({locale:'fr',feedback:'Un commentaire en français.',cached:false});expect(state.call.mock.calls[0][1]).toMatchObject({maxTokens:800,system:expect.stringContaining('untrusted data'),signal:expect.any(AbortSignal)});
 state.locale='de';expect(await(await POST(request())).json()).toMatchObject({locale:'de',feedback:'Ein deutsches Feedback.'});state.locale='fr';expect(await(await POST(request())).json()).toMatchObject({cached:true,locale:'fr'});expect(state.call).toHaveBeenCalledTimes(2);
});
it('fails without generation on premium, preference or body-limit failures',async()=>{
 state.premium=false;expect((await POST(request())).status).toBe(403);state.premium=true;state.error=true;expect((await POST(request())).status).toBe(503);state.error=false;expect((await POST(request('x'.repeat(25000)))).status).toBe(413);expect(state.call).not.toHaveBeenCalled();
});
