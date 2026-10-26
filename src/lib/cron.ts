import { NextResponse } from 'next/server';
import { withRedisLock } from '@/lib/locks';
import { recordMetric } from '@/lib/metrics';
import { getRequestCorrelationId } from '@/lib/utils';
import { observeOperationalSignal } from '@/lib/operational-alerts';

/** Serializes each job for its full runtime; errors stay retryable by the scheduler. */
export function cron(name: string, task: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const correlationId = getRequestCorrelationId(request);
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED', correlationId }, { status: 401, headers: { 'x-request-id': correlationId } });
    }
    const headers = new Headers(request.headers);
    headers.set('x-request-id',correlationId);
    const forwarded = new Request(request,{headers});
    const started = Date.now();
    try {
      const result = await withRedisLock(`cron:${name}`, 120, () => task(forwarded));
      if (!result) await observeOperationalSignal('cronOverlaps',correlationId);
      else if (!result.ok) await observeOperationalSignal('cronFailures',correlationId);
      recordMetric('cron_run', { name, correlationId, durationMs: Date.now() - started, overlap: !result });
      const response = result ?? NextResponse.json({ error: 'Job already running', code: 'CRON_OVERLAP', correlationId }, { status: 409 });
      response.headers.set('x-request-id',correlationId);
      return response;
    } catch {
      recordMetric('cron_error', { name, correlationId }, 'error');
      await observeOperationalSignal('cronFailures',correlationId);
      return NextResponse.json({ error: 'Job failed', code: 'CRON_DEPENDENCY_FAILURE', correlationId }, { status: 503, headers: { 'x-request-id': correlationId } });
    }
  };
}

/** Completes each bounded batch before scheduling more work; rejections propagate. */
export async function mapBatches<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>, deadline = Infinity) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error('Invalid concurrency');
  let completed = 0;
  for (let i = 0; i < items.length && Date.now() < deadline; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(task));
    completed += batch.length;
  }
  return completed;
}
