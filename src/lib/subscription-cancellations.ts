import { createServiceClient } from '@/lib/supabase/server';
import { cancelProviderSubscription } from '@/lib/payment-providers';
import { recordMetric } from '@/lib/metrics';
import { observeOperationalSignal } from '@/lib/operational-alerts';

export async function drainSubscriptionCancellations(userId: string | null = null) {
  const client = createServiceClient();
  const { data, error } = await client.rpc('claim_subscription_cancellations', { p_user_id: userId, p_limit: 3 });
  if (error) throw new Error('Cancellation claim failed');
  const events = (data ?? []) as { subscription_id: string; provider: string; provider_subscription_id: string | null; attempts: number; correlation_id: string }[];
  let completed = 0;
  await Promise.all(events.map(async event => {
    try {
      await cancelProviderSubscription(event.provider,event.provider_subscription_id,`cancel_${event.subscription_id}`);
      const { error: commitError } = await client.rpc('complete_subscription_cancellation', { p_subscription_id: event.subscription_id });
      if (commitError) throw new Error('Cancellation commit failed');
      completed++;
    } catch {
      await observeOperationalSignal('paymentFailures',event.correlation_id);
      const { error: retryError } = await client.from('subscription_cancellations' as never).update({
        status: event.attempts >= 10 ? 'failed' : 'pending', last_error: 'Provider cancellation not confirmed',
        next_attempt_at: new Date(Date.now() + Math.min(3600,2 ** event.attempts * 30) * 1000).toISOString(),
      } as never).eq('subscription_id',event.subscription_id).eq('status','processing').eq('attempts',event.attempts);
      recordMetric('subscription_cancellation_error', { subscriptionId: event.subscription_id, correlationId: event.correlation_id, attempts: event.attempts }, 'error');
      if (retryError) throw new Error('Cancellation retry scheduling failed');
    }
  }));
  return { scanned: events.length, completed, failed: events.length - completed };
}
