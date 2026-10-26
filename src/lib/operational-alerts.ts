import { getRedisClient } from '@/lib/redis';
import { recordMetric } from '@/lib/metrics';

const WINDOW_SECONDS = 900;
export const OPERATIONAL_SIGNALS = ['webhooks','webhookReplays','webhookConflicts','paymentFailures','payoutFailures','cronFailures','cronOverlaps'] as const;
type Signal = typeof OPERATIONAL_SIGNALS[number];
const windowOf = (now: number) => Math.floor(now / (WINDOW_SECONDS * 1000));
const keyOf = (signal: Signal, window: number) => `ops:v1:${window}:${signal}`;
async function bounded<T>(task: Promise<T>) {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([task,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Operational counter timeout')),1500);})]); }
  finally { clearTimeout(timer!); }
}

/** Fixed UTC 15-minute counters; only bounded signal names enter Redis keys. */
export async function observeOperationalSignal(signal: Signal, correlationId: string, now = Date.now()) {
  try { await bounded(getRedisClient().incrementWindow(keyOf(signal,windowOf(now)),WINDOW_SECONDS * 2)); }
  catch { recordMetric('operational_counter_unavailable', { signal, correlationId }, 'error'); }
}

export async function operationalSnapshot(now = Date.now()) {
  const window = windowOf(now);
  const entries = await bounded(Promise.all(OPERATIONAL_SIGNALS.map(async signal => {
    const value = await getRedisClient().get(keyOf(signal,window));
    if (value !== null && !/^\d+$/.test(value)) throw new Error('Invalid operational counter');
    const count = value === null ? 0 : Number(value);
    if (!Number.isSafeInteger(count)) throw new Error('Invalid operational counter');
    return [signal,count] as const;
  })));
  const counts = Object.fromEntries(entries) as Record<Signal,number>;
  const alerts: Record<Signal,boolean> = {
    webhooks: false,
    webhookReplays: counts.webhooks >= 20 && counts.webhookReplays / counts.webhooks > 0.1,
    webhookConflicts: counts.webhookConflicts > 0,
    paymentFailures: counts.paymentFailures > 0,
    payoutFailures: counts.payoutFailures > 0,
    cronFailures: counts.cronFailures > 0,
    cronOverlaps: counts.cronOverlaps >= 2,
  };
  return { windowStart: new Date(window * WINDOW_SECONDS * 1000).toISOString(), counts, alerts };
}
