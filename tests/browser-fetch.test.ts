import { expect, it, vi } from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import { browserFetch } from '@/lib/client/csrf';

function storage():Storage {
  const values=new Map<string,string>();
  return {get length(){return values.size;},clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
}
const payload={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'Private draft text'})};
const key=(transport:ReturnType<typeof vi.fn<typeof fetch>>,index:number)=>new Headers(transport.mock.calls[index][1]?.headers).get('Idempotency-Key');

it('bounds abandoned generic intents, clears permanent failures and preserves explicit financial proofs',async()=>{
 const saved=storage(),proof='liravo:financial-intent:reader:payout:USD';saved.setItem(proof,JSON.stringify({key:'durable-financial-proof'}));
 let actor='reader';const transport=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({error:'Invalid draft'},{status:422})),managed=browserFetch(transport,'https://app.test',()=>'',saved,()=>actor);
 for(let index=0;index<150;index++)await managed('/api/quotes',{...payload,body:JSON.stringify({content:'Failed draft '+index})});expect(saved.length).toBe(1);expect(saved.getItem(proof)).toContain('durable-financial-proof');
 transport.mockImplementation(async()=>Response.json({error:'Temporary failure'},{status:503}));for(let index=0;index<150;index++)await managed('/api/quotes',{...payload,body:JSON.stringify({content:'Pending draft '+index})});expect(saved.length).toBeLessThanOrEqual(129);
 actor='another-reader';await managed('/api/quotes',payload);expect(saved.length).toBe(2);expect(saved.getItem(proof)).toContain('durable-financial-proof');
});

it('retains keys across dependency failures, unreadable acknowledgements and page reloads',async()=>{
  const transport=vi.fn<typeof fetch>(),saved=storage();
  let managed=browserFetch(transport,'https://app.test',()=>'',saved);
  transport.mockResolvedValueOnce(Response.json({error:'Unavailable'},{status:503}));
  await managed('/api/quotes',payload);const first=key(transport,0);
  expect(first).toBeTruthy();expect(saved.length).toBe(1);
  expect(saved.key(0)).not.toContain('Private draft');expect(saved.getItem(saved.key(0)!)).not.toContain('Private draft');
  managed=browserFetch(transport,'https://app.test',()=>'',saved);
  transport.mockResolvedValueOnce(new Response('{',{headers:{'Content-Type':'application/json'}}));
  await managed('/api/quotes',payload);expect(key(transport,1)).toBe(first);
  transport.mockResolvedValueOnce(Response.json({saved:true}));
  await managed('/api/quotes',payload);expect(key(transport,2)).toBe(first);expect(saved.length).toBe(0);
  transport.mockResolvedValueOnce(Response.json({saved:true}));
  await managed('/api/quotes',payload);expect(key(transport,3)).not.toBe(first);
});

it('keeps independent payloads separate and concurrent retries on one key',async()=>{
  const transport=vi.fn<typeof fetch>();let resolve!: (response:Response)=>void;
  const deferred=new Promise<Response>(done=>{resolve=done;});transport.mockReturnValue(deferred);
  const managed=browserFetch(transport,'https://app.test',()=>'',storage());
  const calls=[managed('/api/quotes',payload),managed('/api/quotes',payload),managed('/api/quotes',{...payload,body:JSON.stringify({content:'Another draft'})})];
  await vi.waitFor(()=>expect(transport).toHaveBeenCalledTimes(3));
  const same=transport.mock.calls.filter(call=>call[1]?.body===payload.body);
  const other=transport.mock.calls.find(call=>call[1]?.body!==payload.body)!;
  expect(new Headers(same[0][1]?.headers).get('Idempotency-Key')).toBe(new Headers(same[1][1]?.headers).get('Idempotency-Key'));
  expect(new Headers(other[1]?.headers).get('Idempotency-Key')).not.toBe(new Headers(same[0][1]?.headers).get('Idempotency-Key'));
  resolve(Response.json({saved:true}));await Promise.all(calls);
});

it('normalizes caller keys, adds CSRF proof, and leaves external/auth payloads outside implicit persistence',async()=>{
  const transport=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({ok:true})),saved=storage();
  const managed=browserFetch(transport,'https://app.test',()=> 'liravo-csrf=isolated-browser-proof',saved);
  await managed('/api/quotes',{...payload,headers:{'X-Idempotency-Key':'explicit-intent'}});
  const headers=new Headers(transport.mock.calls[0][1]?.headers);
  expect(headers.get('Idempotency-Key')).toBe('explicit-intent');expect(headers.get('X-CSRF-Token')).toBe('isolated-browser-proof');
  await managed('/api/auth/login',{...payload,body:JSON.stringify({password:'isolated-password'})});
  expect(key(transport,1)).toBeNull();expect(saved.length).toBe(0);
  await managed('https://external.test/api/quotes',payload);
  expect(transport.mock.calls[2][1]).toBe(payload);expect(saved.length).toBe(0);
});

it('does not collapse streamed or multipart Request bodies into an empty-body intent',async()=>{
  const transport=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({ok:true}));
  const managed=browserFetch(transport,'https://app.test',()=>'',storage());
  const body=new FormData();body.set('content','Draft upload');
  await managed(new Request('https://app.test/api/uploads',{method:'POST',body}));
  expect(key(transport,0)).toBeNull();
  await managed(new Request('https://app.test/api/quotes',payload));
  expect(key(transport,1)).toBeTruthy();
});

it('keeps PIN-bearing bodies out of implicit persistent retry signatures while preserving supplied keys',async()=>{
  const transport=vi.fn<typeof fetch>().mockRejectedValue(new Error('Connection reset')),saved=storage(),managed=browserFetch(transport,'https://app.test',()=>'',saved);
  const body={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'2468',currentPin:'1357'})};
  await expect(managed('/api/auth/pin',body)).rejects.toThrow('Connection reset');
  expect(saved.length).toBe(0);expect(key(transport,0)).toBeNull();
  await expect(managed('/api/earnings/request-payout',{...body,headers:{'Content-Type':'application/json','Idempotency-Key':'owned-payout-key'}})).rejects.toThrow('Connection reset');
  expect(key(transport,1)).toBe('owned-payout-key');expect(saved.length).toBe(0);
});

it('retains owner-scoped financial intents across remounts without binding them to the PIN',async()=>{
  const saved=storage(),exports:{useRequestIntent?:(owner:string)=>{durableHeaders(payload:unknown,scope:string):Promise<Record<string,string>>;complete(scope:string):void}}={};
  const code=ts.transpileModule(readFileSync('src/lib/client/useRequestIntent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code,{exports,crypto,TextEncoder,sessionStorage:saved,require:()=>({useRef:(current:unknown)=>({current})})});
  const first=exports.useRequestIntent!('reader-a'),payload={amount:'5',currency:'USD',pin:'2468'};
  const key=(await first.durableHeaders(payload,'payout:USD'))['Idempotency-Key'];
  const restored=exports.useRequestIntent!('reader-a');
  expect((await restored.durableHeaders({...payload,pin:'1357'},'payout:USD'))['Idempotency-Key']).toBe(key);
  const record=JSON.parse(saved.getItem('liravo:financial-intent:reader-a:payout:USD')!);expect(Object.keys(record).sort()).toEqual(['fingerprint','key']);
  expect((await exports.useRequestIntent!('reader-b').durableHeaders(payload,'payout:USD'))['Idempotency-Key']).not.toBe(key);
  expect((await restored.durableHeaders({...payload,currency:'EUR'},'payout:EUR'))['Idempotency-Key']).not.toBe(key);
  restored.complete('payout:USD');expect(saved.getItem('liravo:financial-intent:reader-a:payout:USD')).toBeNull();
  expect((await exports.useRequestIntent!('reader-a').durableHeaders(payload,'payout:USD'))['Idempotency-Key']).not.toBe(key);
});
