import {beforeEach,expect,it,vi} from 'vitest';
import {POST} from '@/app/api/auth/logout/route';
const state=vi.hoisted(()=>({direct:true,revoke:vi.fn(),destroy:vi.fn(),signOut:vi.fn(),removeGrant:vi.fn(),user:true}));
vi.mock('next/headers',()=>({headers:()=>new Headers({authorization:'Bearer fixture-token'}),cookies:()=>({get:()=>undefined,getAll:()=>[{name:'sb-fixture-auth-token.0'},{name:'sb-fixture-auth-token.1'}]})}));
vi.mock('@/lib/db/provider',()=>({isDirectPostgres:()=>state.direct}));
vi.mock('@/lib/db/unified-client',()=>({SESSION_COOKIE:'liravo_session',destroySession:state.destroy}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:async()=>state.user?{id:'actor'}:null}));
vi.mock('@/lib/auth/second-factor',()=>({factorHash:()=> 'a'.repeat(64),providerSessionHash:()=> 'b'.repeat(64)}));
vi.mock('@/lib/push-subscriptions',()=>({revokePushSession:state.revoke}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'actor'}}}),signOut:state.signOut}}),createServiceClient:()=>({from:()=>({delete:()=>({eq:state.removeGrant})})})}));
beforeEach(()=>{vi.clearAllMocks();state.direct=true;state.user=true;state.revoke.mockResolvedValue(undefined);state.destroy.mockResolvedValue(undefined);state.signOut.mockResolvedValue({error:null});state.removeGrant.mockResolvedValue({error:null});process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';});
it('revokes authentication even when push cleanup fails and clears every local cookie',async()=>{
 state.revoke.mockRejectedValue(Error('Push unavailable'));const response=await POST();expect(response.status).toBe(503);expect(state.destroy).toHaveBeenCalledWith('fixture-token');expect(response.cookies.get('liravo_session')?.value).toBe('');expect(response.cookies.get('sb-fixture-auth-token.0')?.value).toBe('');expect(response.cookies.get('sb-fixture-auth-token.1')?.value).toBe('');expect(response.headers.get('cache-control')).toBe('no-store');
});
it('does not create revocation tombstones for arbitrary invalid direct sessions',async()=>{
 state.user=false;expect((await POST()).status).toBe(200);expect(state.revoke).toHaveBeenCalledWith('a'.repeat(64),false);expect(state.destroy).toHaveBeenCalledOnce();
});
it('attempts independent provider, MFA and push revocation without signing out other devices',async()=>{
 state.direct=false;state.revoke.mockRejectedValue(Error('Push unavailable'));expect((await POST()).status).toBe(503);expect(state.removeGrant).toHaveBeenCalledWith('session_hash','b'.repeat(64));expect(state.signOut).toHaveBeenCalledWith({scope:'local'});
});
