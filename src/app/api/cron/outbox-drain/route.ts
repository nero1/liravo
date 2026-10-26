import { createServiceClient } from '@/lib/supabase/server';
import { recordMetric } from '@/lib/metrics';
import { getRequestCorrelationId } from '@/lib/utils';
import { cron } from '@/lib/cron';
import { NextResponse } from 'next/server';
import { drainPayoutSettlements } from '@/lib/payout-settlement';
import { drainOutbox } from '@/lib/outbox-worker';
import { drainSubscriptionCancellations } from '@/lib/subscription-cancellations';

async function run(req: Request) {

  const batch = Number(req.headers.get('x-outbox-batch') ?? '50');
  const batchSize = Number.isFinite(batch) ? Math.min(200, Math.max(1, batch)) : 50;

  const {error:expiryError}=await createServiceClient().rpc('expire_subscription_entitlements' as never,{p_limit:200} as never);
  if (expiryError) throw new Error('Subscription expiry reconciliation failed');
  const [result, cancellations, payouts] = await Promise.all([drainOutbox(batchSize), drainSubscriptionCancellations(),drainPayoutSettlements(getRequestCorrelationId(req))]);
  const { data, error } = await createServiceClient().rpc('financial_integrity_snapshot' as never);
  if (error) throw new Error('Financial reconciliation failed');
  const anomalies = data as Record<string, number>;
  recordMetric('financial_integrity_snapshot', { ...anomalies, correlationId: getRequestCorrelationId(req) }, Object.values(anomalies).some(value => value > 0) ? 'error' : 'info');
  return NextResponse.json({ ...result, failed: result.failed + cancellations.failed, cancellations, payouts, anomalies });
}

export const GET = cron('outbox-drain', run);
export const POST = GET;

export const maxDuration = 60;
