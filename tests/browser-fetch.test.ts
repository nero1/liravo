import { expect, it, vi } from 'vitest';
import { browserFetch } from '@/lib/client/csrf';

function storage():Storage {
  const values=new Map<string,string>();
  return {get length(){return values.size;},clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
}
const payload={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'Private draft text'})};
const key=(transport:ReturnType<typeof vi.fn<typeof fetch>>,index:number)=>new Headers(transport.mock.calls[index][1]?.headers).get('Idempotency-Key');

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
