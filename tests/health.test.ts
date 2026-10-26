import { beforeEach, expect, it, vi } from 'vitest';
import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { GET } from '@/app/api/health/route';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/redis',()=>({getRedisClient:vi.fn()}));
const limit=vi.fn();
const values=new Map<string,string>();
const set=vi.fn(async(key:string,value:string)=>{values.set(key,value);});
beforeEach(()=>{
  vi.clearAllMocks();values.clear();
  limit.mockResolvedValue({data:[{name:'creator_tips'}],error:null});
  vi.mocked(createServiceClient).mockReturnValue({from:()=>({select:()=>({limit})})} as unknown as ReturnType<typeof createServiceClient>);
  vi.mocked(getRedisClient).mockReturnValue({set,get:async(key:string)=>values.get(key)??null,del:async(key:string)=>{values.delete(key);}} as unknown as ReturnType<typeof getRedisClient>);
});

it('checks the real schema without an unavailable RPC or adapter-specific chaining',async()=>{
  expect(await (await GET()).json()).toMatchObject({status:'ok',services:{database:'ok',redis:'ok'}});
  expect(limit).toHaveBeenCalledWith(1);
});

it('reports database and Redis failures independently without treating unknown RPCs as healthy',async()=>{
  limit.mockResolvedValue({data:null,error:{code:'42501'}});
  expect(await (await GET()).json()).toMatchObject({status:'degraded',services:{database:'error',redis:'ok'}});
  limit.mockResolvedValue({data:[],error:null});
  vi.mocked(getRedisClient).mockImplementation(()=>{throw new Error('unavailable');});
  expect(await (await GET()).json()).toMatchObject({status:'degraded',services:{database:'ok',redis:'error'}});
});

it('uses independent Redis probes during concurrent health requests',async()=>{
  const results=await Promise.all(Array.from({length:8},()=>GET()));
  for(const response of results) expect((await response.json()).status).toBe('ok');
  expect(new Set(set.mock.calls.map(([key])=>key)).size).toBe(8);
  expect(values.size).toBe(0);
});
