import { createServiceClient } from '@/lib/supabase/server';
import { recordMetric } from '@/lib/metrics';
import { getRequestCorrelationId } from '@/lib/utils';
import { cron } from '@/lib/cron';
import { NextResponse } from 'next/server';
import { drainOutbox } from '@/lib/outbox-worker';

async function run(req: Request) {

  const batch = Number(req.headers.get('x-outbox-batch') ?? '50');
  const batchSize = Number.isFinite(batch) ? Math.min(200, Math.max(1, batch)) : 50;

  const result = await drainOutbox(batchSize);
  const { data, error } = await createServiceClient().rpc('financial_integrity_snapshot' as never);
  if (error) throw new Error('Financial reconciliation failed');
  const anomalies = data as Record<string, number>;
  recordMetric('financial_integrity_snapshot', { ...anomalies, correlationId: getRequestCorrelationId(req) }, Object.values(anomalies).some(value => value > 0) ? 'error' : 'info');
  return NextResponse.json({ ...result, anomalies });
}

export const GET = cron('outbox-drain', run);
export const POST = GET;

export const maxDuration = 60;
