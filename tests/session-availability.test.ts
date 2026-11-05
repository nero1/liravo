import {beforeEach,expect,it,vi} from 'vitest';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {GET} from '@/app/api/users/me/route';
import {POST} from '@/app/api/auth/session/route';
const state=vi.hoisted(()=>({direct:false,getUser:vi.fn(),readDirect:vi.fn()}));
vi.mock('next/headers',()=>({headers:()=>new Headers({authorization:'Bearer fixture-token'}),cookies:()=>({get:()=>undefined})}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:()=>state.direct}));
vi.mock('@/lib/db/unified-client',()=>({SESSION_COOKIE:'liravo_session'}));
vi.mock('@/lib/auth/second-factor',()=>({readDirectSession:state.readDirect}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:state.getUser}}),createServiceClient:()=>{throw Error('No database access expected');}}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:async()=>({allowed:true})}));
beforeEach(()=>{state.direct=false;state.getUser.mockReset();state.readDirect.mockReset();});
it('distinguishes confirmed provider rejection from temporary verification failure for bearer sessions',async()=>{
 for(const status of[400,401,403]){state.getUser.mockResolvedValue({data:{user:null},error:{status}});expect(await getCurrentUser()).toBeNull();expect((await GET()).status).toBe(401);}
 for(const status of[0,429,500,503]){state.getUser.mockResolvedValue({data:{user:null},error:{status}});await expect(getCurrentUser()).rejects.toThrow('Session verification unavailable');expect((await GET()).status).toBe(503);expect((await POST(new Request('https://app.test/api/auth/session',{method:'POST',headers:{authorization:'Bearer fixture-token'}}))).status).toBe(503);}
});
it('returns a retryable profile response when direct session verification fails',async()=>{
 state.direct=true;state.readDirect.mockRejectedValue(Error('Redis unavailable'));expect((await GET()).status).toBe(503);expect(state.readDirect).toHaveBeenCalledWith('fixture-token');
});
