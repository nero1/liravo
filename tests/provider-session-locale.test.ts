import {beforeEach,expect,it,vi} from 'vitest';
import {NextResponse} from 'next/server';
import {POST} from '@/app/api/auth/session/route';
const state=vi.hoisted(()=>({authenticated:true,failed:false,locale:'en',calls:[] as unknown[]}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:()=>false}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/supabase/server',()=>({
  createClient:()=>({auth:{getUser:async()=>({data:{user:state.authenticated?{id:'reader'}:null}})}}),
  createServiceClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{state.calls.push([name,args]);if(!state.failed)state.locale=String(args.p_locale);return {data:state.locale,error:state.failed?{code:'08006'}:null};},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'reader',preferred_locale:state.locale},error:null})})})})}),
}));
vi.mock('@/lib/auth/second-factor',()=>({factorProfile:async()=>({is_banned:false,deleted_at:null}),providerFactorAuthorized:async()=>true,factorSessionResponse:(data:unknown)=>NextResponse.json(data),currentFactorSessionHash:vi.fn(),beginLoginChallenge:vi.fn()}));
beforeEach(()=>{state.authenticated=true;state.failed=false;state.locale='en';state.calls=[];});
const request=()=>new Request('https://app.test/api/auth/session',{method:'POST',headers:{Authorization:'Bearer fixture-token','X-Liravo-Preferred-Locale':'fr'}});
it('returns the initialized locale in the managed native session profile',async()=>{
  const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({user:{id:'reader',preferred_locale:'fr'}});expect(state.calls).toEqual([['initialize_account_locale',{p_user_id:'reader',p_locale:'fr'}]]);
});
it('requires primary authentication and does not acknowledge failed locale initialization',async()=>{
  state.authenticated=false;expect((await POST(request())).status).toBe(401);expect(state.calls).toHaveLength(0);
  state.authenticated=true;state.failed=true;expect((await POST(request())).status).toBe(503);
});
