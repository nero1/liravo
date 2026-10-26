import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRedisClient } from '@/lib/redis';
import { recordMetric } from '@/lib/metrics';
import { observeOperationalSignal, operationalSnapshot } from '@/lib/operational-alerts';

vi.mock('@/lib/redis',()=>({getRedisClient:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
const values=new Map<string,string>();
const incrementWindow=vi.fn(async(key:string)=>{const value=Number(values.get(key)??0)+1; values.set(key,String(value)); return value;});
beforeEach(()=>{
  vi.clearAllMocks(); values.clear();
  vi.mocked(getRedisClient).mockReturnValue({get:async(key:string)=>values.get(key)??null,incrementWindow} as unknown as ReturnType<typeof getRedisClient>);
});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
const now=Date.parse('2026-10-26T12:05:00Z');

it('aggregates concurrent signals without storing request IDs in counter keys',async()=>{
  await Promise.all(Array.from({length:25},()=>observeOperationalSignal('webhooks','request-private-value',now)));
  await Promise.all(Array.from({length:3},()=>observeOperationalSignal('webhookReplays','request-private-value',now)));
  const snapshot=await operationalSnapshot(now);
  expect(snapshot.counts.webhooks).toBe(25);
  expect(snapshot.alerts.webhookReplays).toBe(true);
  expect(snapshot.windowStart).toBe('2026-10-26T12:00:00.000Z');
  expect(Array.from(values.keys()).join()).not.toContain('request-private-value');
  expect(incrementWindow.mock.calls[0]).toHaveLength(2);
});

it('alerts on one financial conflict/failure and two overlaps, while isolating time windows',async()=>{
  for(const signal of ['webhookConflicts','paymentFailures','payoutFailures','cronFailures'] as const) await observeOperationalSignal(signal,'correlation',now);
  await observeOperationalSignal('cronOverlaps','correlation',now);
  expect((await operationalSnapshot(now)).alerts.cronOverlaps).toBe(false);
  await observeOperationalSignal('cronOverlaps','correlation',now);
  const snapshot=await operationalSnapshot(now);
  expect(Object.values(snapshot.alerts).filter(Boolean)).toHaveLength(5);
  expect(Object.values((await operationalSnapshot(now+900_000)).counts).every(value=>value===0)).toBe(true);
});

it('does not alert on ordinary low-volume payment redelivery',async()=>{
  await observeOperationalSignal('webhooks','correlation',now);
  await observeOperationalSignal('webhookReplays','correlation',now);
  expect((await operationalSnapshot(now)).alerts.webhookReplays).toBe(false);
});

it('exposes counter read failures and logs write failures without changing committed payments',async()=>{
  vi.mocked(getRedisClient).mockImplementation(()=>{throw new Error('offline');});
  await expect(operationalSnapshot(now)).rejects.toThrow('offline');
  await expect(observeOperationalSignal('paymentFailures','correlation',now)).resolves.toBeUndefined();
  expect(recordMetric).toHaveBeenCalledWith('operational_counter_unavailable',{signal:'paymentFailures',correlationId:'correlation'},'error');
});

it('rejects malformed counters instead of presenting healthy zeroes',async()=>{
  vi.mocked(getRedisClient).mockReturnValue({get:async()=>'{"count":1}'} as unknown as ReturnType<typeof getRedisClient>);
  await expect(operationalSnapshot(now)).rejects.toThrow('Invalid operational counter');
});

it('bounds telemetry delays so an unavailable counter cannot hold a payment response open',async()=>{
  vi.useFakeTimers();
  vi.mocked(getRedisClient).mockReturnValue({incrementWindow:()=>new Promise(()=>{})} as unknown as ReturnType<typeof getRedisClient>);
  const task=observeOperationalSignal('paymentFailures','bounded-request',now);
  await vi.advanceTimersByTimeAsync(1501);
  await expect(task).resolves.toBeUndefined();
  expect(recordMetric).toHaveBeenCalledWith('operational_counter_unavailable',{signal:'paymentFailures',correlationId:'bounded-request'},'error');
});
