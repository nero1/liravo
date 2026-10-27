import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

it('keeps mobile mutation keys across ambiguous failures, isolates accounts, and rotates after acknowledgement', async () => {
  const state = { user: { id: 'reader-a' }, token: 'token-a' };
  const transport = vi.fn();
  const exports: { api?: { post(path:string,body:unknown,headers?:Record<string,string>):Promise<unknown> } } = {};
  const code = ts.transpileModule(readFileSync('mobile/lib/api.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code, { exports, fetch:transport,AbortController,setTimeout,clearTimeout, require:(name:string) => {
    if(name==='@/constants/api') return {API_BASE:'https://app.test'};
    if(name==='@/stores/auth') return {useAuthStore:{getState:()=>state}};
    throw new Error(`Unexpected mobile dependency: ${name}`);
  }});
  const api=exports.api!;
  transport.mockRejectedValueOnce(new Error('Connection reset'));
  await expect(api.post('/api/quotes',{content:'Quote'})).rejects.toThrow('Connection reset');
  expect(transport.mock.calls[0][1].credentials).toBe('omit');
  expect(transport.mock.calls[0][1].headers['X-Liravo-Client']).toBe('native');
  const first=transport.mock.calls[0][1].headers['Idempotency-Key'];
  transport.mockResolvedValueOnce({ok:true,json:async()=>{throw new Error('Truncated JSON');}});
  await expect(api.post('/api/quotes',{content:'Quote'})).rejects.toThrow('Truncated JSON');
  expect(transport.mock.calls[1][1].headers['Idempotency-Key']).toBe(first);
  transport.mockResolvedValue({ok:true,json:async()=>({saved:true})});
  state.user.id='reader-b'; state.token='token-b';
  await api.post('/api/quotes',{content:'Quote'});
  expect(transport.mock.calls[2][1].headers['Idempotency-Key']).not.toBe(first);
  state.user.id='reader-a'; state.token='new-token-a';
  await api.post('/api/quotes',{content:'Quote'});
  expect(transport.mock.calls[3][1].headers['Idempotency-Key']).toBe(first);
  await api.post('/api/quotes',{content:'Quote'});
  expect(transport.mock.calls[4][1].headers['Idempotency-Key']).not.toBe(first);
  await api.post('/api/quotes',{content:'Quote'},{'idempotency-key':'explicit-intent-key'});
  expect(transport.mock.calls[5][1].headers['Idempotency-Key']).toBe('explicit-intent-key');
  expect(transport.mock.calls[5][1].headers).not.toHaveProperty('idempotency-key');
});

it('keeps primary authentication stateless without retaining password mutation intents or a previous bearer',async()=>{
  const state={user:{id:'previous-reader'},token:'old-token'},transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({token:'new-token'})});
  const exports:{api?:{post(path:string,body:unknown):Promise<unknown>}}={};
  const code=ts.transpileModule(readFileSync('mobile/lib/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,fetch:transport,AbortController,setTimeout,clearTimeout,require:(name:string)=>name==='@/constants/api'?{API_BASE:'https://app.test'}:{useAuthStore:{getState:()=>state}}});
  await exports.api!.post('/api/auth/login',{email:'reader@example.test',password:'test-password'});
  const options=transport.mock.calls[0][1];
  expect(options.credentials).toBe('omit');
  expect(options.headers).not.toHaveProperty('Authorization');
  expect(options.headers).not.toHaveProperty('Idempotency-Key');
});

it('clears cached private queries and serializes secure token persistence across account transitions',async()=>{
  const clear=vi.fn(),writes:string[]=[],pending:{release?:()=>void}={};
  const secure={getItemAsync:vi.fn().mockResolvedValue('stored-token'),setItemAsync:vi.fn((_:string,token:string)=>new Promise<void>(resolve=>{writes.push(token);pending.release=resolve;})),deleteItemAsync:vi.fn(async()=>{writes.push('deleted');})};
  let state:Record<string,any>;
  const exports:{useAuthStore?:{getState:()=>typeof state}}={};
  const code=ts.transpileModule(readFileSync('mobile/stores/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='zustand')return {create:(initialize:any)=>{state=initialize((patch:object)=>Object.assign(state,patch),()=>state);return {getState:()=>state};}};
    if(name==='expo-secure-store')return secure;
    if(name==='@/lib/queryClient')return {queryClient:{clear}};
    throw new Error(`Unexpected dependency: ${name}`);
  }});
  const store=exports.useAuthStore!.getState();
  store.setUser({id:'reader-a'});clear.mockClear();
  const write=store.setToken('token-a');
  await Promise.resolve();await Promise.resolve();
  expect(store.user).toBeNull();expect(clear).toHaveBeenCalledOnce();
  const logout=store.signOut();
  expect(store.token).toBeNull();
  pending.release!();await write;await logout;
  expect(writes).toEqual(['token-a','deleted']);
  secure.getItemAsync.mockImplementationOnce(()=>new Promise(resolve=>{pending.release=()=>resolve('obsolete-token');}));
  const loading=store.loadStoredToken();
  await store.signOut();pending.release!();await loading;
  expect(store.token).toBeNull();
});

it('times out an ambiguous mobile request and preserves its mutation key for retry',async()=>{
  vi.useFakeTimers();
  try{
    const state={user:{id:'reader'},token:'token'},transport=vi.fn();
    transport.mockImplementationOnce((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Request timed out')))));
    const exports:{api?:{post(path:string,body:unknown):Promise<unknown>}}={};
    const code=ts.transpileModule(readFileSync('mobile/lib/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    runInNewContext(code,{exports,fetch:transport,AbortController,setTimeout,clearTimeout,require:(name:string)=>name==='@/constants/api'?{API_BASE:'https://app.test'}:{useAuthStore:{getState:()=>state}}});
    const pending=expect(exports.api!.post('/api/quotes',{content:'Quote'})).rejects.toThrow('timed out');
    const first=transport.mock.calls[0][1].headers['Idempotency-Key'];
    await vi.advanceTimersByTimeAsync(15000);await pending;
    transport.mockResolvedValueOnce({ok:true,status:204});
    await expect(exports.api!.post('/api/quotes',{content:'Quote'})).resolves.toBeUndefined();
    expect(transport.mock.calls[1][1].headers['Idempotency-Key']).toBe(first);
  }finally{vi.useRealTimers();}
});
