import { afterEach,expect,it,vi } from 'vitest';
import { fetchWithRetry } from '@/lib/retry';
import { callAI } from '@/lib/ai-client';
vi.mock('@/lib/retry',()=>({fetchWithRetry:vi.fn()}));
vi.mock('@/lib/redis',()=>({getRedisClient:()=>({get:async()=>null,incr:async()=>1,expire:async()=>{},set:async()=>{},del:async()=>{}})}));
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it('rejects invalid primary output and validates fallback while bounding Gemini output',async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','isolated-deepseek-fixture');vi.stubEnv('GEMINI_API_KEY','isolated-gemini-fixture');
  vi.mocked(fetchWithRetry).mockResolvedValueOnce(Response.json({choices:[{message:{content:'invalid'}}]})).mockResolvedValueOnce(Response.json({candidates:[{content:{parts:[{text:'valid'}]}}]}));
  expect(await callAI('data',{system:'Trusted system',maxTokens:123,validate:text=>text==='valid'})).toEqual({text:'valid',provider:'gemini'});
  const options=vi.mocked(fetchWithRetry).mock.calls[1][1]!;
  expect(JSON.parse(options.body as string)).toMatchObject({generationConfig:{maxOutputTokens:123},system_instruction:{parts:[{text:'Trusted system'}]}});
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it('does not contact a fallback after the shared request deadline expires',async()=>{
  vi.stubEnv('DEEPSEEK_API_KEY','isolated-deepseek-fixture');vi.stubEnv('GEMINI_API_KEY','isolated-gemini-fixture');
  vi.mocked(fetchWithRetry).mockRejectedValueOnce(new Error('Aborted'));
  await expect(callAI('data',{signal:AbortSignal.abort()})).rejects.toThrow('deadline');
  expect(fetchWithRetry).toHaveBeenCalledOnce();
});
