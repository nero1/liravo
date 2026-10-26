import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

it('keeps mobile mutation keys across ambiguous failures, isolates accounts, and rotates after acknowledgement', async () => {
  const state = { user: { id: 'reader-a' }, token: 'token-a' };
  const transport = vi.fn();
  const exports: { api?: { post(path:string,body:unknown,headers?:Record<string,string>):Promise<unknown> } } = {};
  const code = ts.transpileModule(readFileSync('mobile/lib/api.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code, { exports, fetch:transport, require:(name:string) => {
    if(name==='@/constants/api') return {API_BASE:'https://app.test'};
    if(name==='@/stores/auth') return {useAuthStore:{getState:()=>state}};
    throw new Error(`Unexpected mobile dependency: ${name}`);
  }});
  const api=exports.api!;
  transport.mockRejectedValueOnce(new Error('Connection reset'));
  await expect(api.post('/api/quotes',{content:'Quote'})).rejects.toThrow('Connection reset');
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
