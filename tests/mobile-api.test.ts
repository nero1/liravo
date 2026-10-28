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
  await exports.api!.post('/api/users/verify-recovery',{token:'one-time-email-proof'});
  expect(transport.mock.calls[1][1].headers).not.toHaveProperty('Authorization');expect(transport.mock.calls[1][1].headers).not.toHaveProperty('Idempotency-Key');
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

it('renders numeric-string ratings safely in both mobile book card layouts',()=>{
  const exports:{BookCard?:(props:unknown)=>unknown}={};
  const code=ts.transpileModule(readFileSync('mobile/components/books/BookCard.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const element=(type:unknown,props:unknown)=>({type,props});
  runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='react/jsx-runtime')return {jsx:element,jsxs:element};
    if(name==='react-native')return {View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity'};
    if(name==='expo-image')return {Image:'Image'};
    if(name==='lucide-react-native')return {Star:'Star'};
    if(name==='expo-router')return {useRouter:()=>({push:()=>{}})};
    throw new Error(`Unexpected mobile dependency: ${name}`);
  }});
  const content=(node:unknown):string=>{
    if(node==null||typeof node==='boolean')return '';
    if(typeof node==='string'||typeof node==='number')return String(node);
    if(Array.isArray(node))return node.map(content).join(' ');
    return content((node as {props:{children?:unknown}}).props.children);
  };
  for(const compact of [true,false]){
    expect(content(exports.BookCard!({book:{id:'book',title:'Book',author_name:'Author',average_rating:'4.25'},compact}))).toContain('4.3');
    expect(content(exports.BookCard!({book:{id:'book',title:'Book',author_name:'Author',average_rating:'invalid'},compact}))).not.toContain('NaN');
  }
});

it('does not cache PIN-bearing mutation signatures and preserves explicit payout keys',async()=>{
  const transport=vi.fn().mockRejectedValue(new Error('Connection reset'));
  const exports:{api?:{post(path:string,body:unknown,headers?:Record<string,string>):Promise<unknown>}}={};
  const code=ts.transpileModule(readFileSync('mobile/lib/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,fetch:transport,AbortController,setTimeout,clearTimeout,require:(name:string)=>{
    if(name==='@/constants/api')return {API_BASE:'https://app.test'};
    if(name==='@/stores/auth')return {useAuthStore:{getState:()=>({user:{id:'pin-reader'},token:'pin-token'})}};
    throw new Error('Unexpected dependency');
  }});
  await expect(exports.api!.post('/api/auth/pin',{pin:'2468'})).rejects.toThrow();
  expect(transport.mock.calls[0][1].headers).not.toHaveProperty('Idempotency-Key');
  await expect(exports.api!.post('/api/earnings/request-payout',{pin:'2468',amount:'5'},{'Idempotency-Key':'owned-payout-key'})).rejects.toThrow();
  expect(transport.mock.calls[1][1].headers['Idempotency-Key']).toBe('owned-payout-key');
});

it('restores native financial keys from secure storage across remounts and omits PIN proof',async()=>{
  const saved=new Map<string,string>();
  const exports:{useRequestIntent?:(owner:string)=>{durableHeaders(payload:unknown,scope:string):Promise<Record<string,string>>;complete(scope:string):Promise<void>}}={};
  const code=ts.transpileModule(readFileSync('mobile/hooks/useRequestIntent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{
    if(name==='react')return {useRef:(current:unknown)=>({current})};
    if(name==='expo-secure-store')return {getItemAsync:async(key:string)=>saved.get(key)??null,setItemAsync:async(key:string,value:string)=>{saved.set(key,value);},deleteItemAsync:async(key:string)=>{saved.delete(key);}};
    throw new Error('Unexpected dependency');
  }});
  const payload={amount:'5',currency:'USD',pin:'2468'},first=exports.useRequestIntent!('reader-a');
  const key=(await first.durableHeaders(payload,'payout:USD'))['Idempotency-Key'];
  const restored=exports.useRequestIntent!('reader-a');expect((await restored.durableHeaders({...payload,pin:'1357'},'payout:USD'))['Idempotency-Key']).toBe(key);
  const record=JSON.parse(saved.get('financial.reader-a.payout_USD')!);expect(JSON.parse(record.payload)).toEqual({amount:'5',currency:'USD'});
  expect((await exports.useRequestIntent!('reader-b').durableHeaders(payload,'payout:USD'))['Idempotency-Key']).not.toBe(key);
  await restored.complete('payout:USD');expect(saved.has('financial.reader-a.payout_USD')).toBe(false);
});

it('sends native file uploads as multipart without inventing a JSON body or caching file intents',async()=>{
  const state={user:{id:'reader-a'},token:'token-a'},transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({uploadId:'owned-upload'})});
  const exports:{api?:{upload(path:string,body:FormData,headers:Record<string,string>):Promise<unknown>}}={};
  const code=ts.transpileModule(readFileSync('mobile/lib/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,fetch:transport,FormData,AbortController,setTimeout,clearTimeout,require:(name:string)=>name==='@/constants/api'?{API_BASE:'https://app.test'}:{useAuthStore:{getState:()=>state}}});
  const body=new FormData();body.set('file',new File(['fixture'],'photo.jpg',{type:'image/jpeg'}));
  await exports.api!.upload('/api/users/avatar',body,{'X-Liravo-Actor':'reader-a'});const options=transport.mock.calls[0][1];
  expect(options.body).toBe(body);expect(options.headers).not.toHaveProperty('Content-Type');expect(options.headers).not.toHaveProperty('Idempotency-Key');expect(options.headers.Authorization).toBe('Bearer token-a');expect(options.headers['X-Liravo-Actor']).toBe('reader-a');
});
