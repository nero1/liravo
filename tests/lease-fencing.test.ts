import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {withRedisLock,withDatabaseFence,leaseSignal,assertLeaseOwned,setLeaseCache} from '@/lib/locks';
import {serviceFetch} from '@/lib/db/service-fetch';
const state=vi.hoisted(()=>({owner:true,expire:vi.fn(),remove:vi.fn(),setOwned:vi.fn(),fence:null as null|{name:string;owner:string;epoch:number}}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>({setNxEx:async()=>true,compareExpire:state.expire,compareDelete:state.remove,setOwned:state.setOwned})}));
beforeEach(()=>{state.owner=true;state.expire.mockReset();state.remove.mockReset();state.setOwned.mockReset();state.expire.mockImplementation(async()=>state.owner?1:0);state.remove.mockResolvedValue(1);state.setOwned.mockResolvedValue(1);});
afterEach(()=>{vi.unstubAllGlobals();});
it('aborts promptly after ownership replacement and prevents the old worker’s next effect',async()=>{
 let release!:()=>void,started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve),gate=new Promise<void>(resolve=>release=resolve);const effect=vi.fn();let signal:AbortSignal|undefined;
 const pending=expect(withRedisLock('fixture',1,async()=>{signal=leaseSignal();started();await gate;await assertLeaseOwned();effect();})).rejects.toThrow('ownership lost');
 await ready;state.owner=false;await pending;expect(signal?.aborted).toBe(true);release();await new Promise(resolve=>setTimeout(resolve,0));expect(effect).not.toHaveBeenCalled();expect(state.remove).toHaveBeenCalledOnce();
});
it('reports renewal failures and rejects stale cache writes atomically',async()=>{
 state.expire.mockRejectedValue(Error('Redis unavailable'));await expect(withRedisLock('fixture',1,async()=>true)).rejects.toThrow('ownership lost');
 state.expire.mockResolvedValue(1);state.setOwned.mockResolvedValue(0);await expect(withRedisLock('cache',3,()=>setLeaseCache('result','value',60))).rejects.toThrow('ownership lost');expect(state.setOwned).toHaveBeenCalledWith('lock:cache',expect.any(String),'result','value',60);
});
it('forwards normal requests with a finite deadline and respects cancellation',async()=>{
 const transport=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',transport);
 await serviceFetch('https://fixture.supabase.co/rest/v1/users',{headers:{Authorization:'Bearer fixture'},method:'GET'});expect(transport.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
 await expect(serviceFetch('https://fixture.supabase.co/rest/v1/users',{signal:AbortSignal.abort()})).rejects.toThrow();expect(transport).toHaveBeenCalledOnce();
});

it('fences Supabase RPCs in one database transaction and tags ordinary mutations',async()=>{
 const transport=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',transport);const fence={name:'similar-books',owner:crypto.randomUUID(),epoch:4};
 await withRedisLock('fixture',3,()=>withDatabaseFence(fence,async()=>{
  await serviceFetch('https://fixture.supabase.co/rest/v1/rpc/compute_similar_books_batch',{method:'POST',body:JSON.stringify({p_limit:20})});
  await serviceFetch('https://fixture.supabase.co/rest/v1/books',{method:'PATCH',body:'{}'});
 }));
 expect(transport.mock.calls[0][0]).toBe('https://fixture.supabase.co/rest/v1/rpc/run_maintenance_rpc');expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({p_name:'similar-books',p_owner:fence.owner,p_epoch:4,p_function:'compute_similar_books_batch',p_args:{p_limit:20}});expect(transport.mock.calls[1][1].headers.get('x-liravo-maintenance')).toBe(JSON.stringify(fence));
});
