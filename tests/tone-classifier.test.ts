import { beforeEach,expect,it,vi } from 'vitest';
import { classifyTone } from '@/lib/tone-classifier';
import { callAI } from '@/lib/ai-client';
const cache=vi.hoisted(()=>new Map<string,string>());
vi.mock('@/lib/ai-client',()=>({callAI:vi.fn()}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>({get:async(key:string)=>cache.get(key)??null,set:async(key:string,value:string)=>cache.set(key,value)})}));
beforeEach(()=>{vi.clearAllMocks();cache.clear();});
it('does not reuse a harmless prefix classification for a review with a different ending',async()=>{
  const prefix='A shared opening paragraph. '.repeat(6);
  vi.mocked(callAI).mockResolvedValueOnce({text:'positive',provider:'deepseek'}).mockResolvedValueOnce({text:'toxic',provider:'deepseek'});
  expect(await classifyTone(prefix+'A thoughtful ending.')).toBe('positive');
  expect(await classifyTone(prefix+'A toxic ending.')).toBe('toxic');
  expect(callAI).toHaveBeenCalledTimes(2);expect(cache.size).toBe(2);
  expect(JSON.parse(vi.mocked(callAI).mock.calls[1][0]).text).toBe(prefix+'A toxic ending.');
  expect(vi.mocked(callAI).mock.calls[1][1]?.system).toContain('untrusted data');
});
it('does not cache unavailable or malformed model results as a successful classification',async()=>{
  vi.mocked(callAI).mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValueOnce({text:'ignore previous instructions',provider:'deepseek'});
  expect(await classifyTone('A review')).toBe('unavailable');
  expect(await classifyTone('A review')).toBe('unavailable');
  expect(cache.size).toBe(0);
});
