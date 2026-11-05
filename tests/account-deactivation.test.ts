import {beforeEach,expect,it,vi} from 'vitest';
import {DELETE} from '@/app/api/users/delete-account/route';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {destroySession} from '@/lib/db/unified-client';
const state=vi.hoisted(()=>({changes:[] as Record<string,unknown>[],actors:[] as string[]}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkCriticalRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:()=>true}));
vi.mock('@/lib/db/unified-client',()=>({SESSION_COOKIE:'liravo-session',destroySession:vi.fn()}));
vi.mock('next/headers',()=>({cookies:()=>({get:()=>undefined})}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(),createServiceClient:()=>({from:()=>({update:(changes:Record<string,unknown>)=>({eq:async(_field:string,actor:string)=>{state.changes.push(changes);state.actors.push(actor);return {error:null};}})})})}));
beforeEach(()=>{state.changes=[];state.actors=[];vi.mocked(destroySession).mockReset();vi.mocked(getCurrentUser).mockResolvedValue({id:'12345678-0000-4000-8000-000000000001'} as never);});
it('deactivates the authenticated account and revokes its native bearer session without promising an unavailable purge',async()=>{
  const response=await DELETE(new Request('https://app.test/api/users/delete-account',{method:'DELETE',headers:{Authorization:'Bearer isolated-session-token'}}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({deleted:true,status:'deactivated'});expect(destroySession).toHaveBeenCalledWith('isolated-session-token');expect(state.actors).toEqual(['12345678-0000-4000-8000-000000000001']);expect(state.changes[0]).toMatchObject({display_name:'[Deleted User]',bio:null,avatar_url:null});
});
it('does not collide deleted identities for accounts sharing a UUID prefix',async()=>{
  await DELETE(new Request('https://app.test/api/users/delete-account',{method:'DELETE'}));vi.mocked(getCurrentUser).mockResolvedValue({id:'12345678-0000-4000-8000-000000000002'} as never);await DELETE(new Request('https://app.test/api/users/delete-account',{method:'DELETE'}));expect(state.changes[0].username).not.toBe(state.changes[1].username);
});
it('acknowledges committed deactivation when secondary session cleanup fails',async()=>{
  vi.mocked(destroySession).mockRejectedValueOnce(Error('Redis unavailable'));expect((await DELETE(new Request('https://app.test/api/users/delete-account',{method:'DELETE',headers:{Authorization:'Bearer isolated-session-token'}}))).status).toBe(200);
});
