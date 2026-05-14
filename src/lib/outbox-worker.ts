import { createServiceClient } from '@/lib/supabase/server';
import { createNotification } from '@/services/notifications';
import { awardXP } from '@/services/xp';
import { recordMetric } from '@/lib/metrics';

const MAX_ATTEMPTS = 10;

type OutboxEventRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function nextDelaySeconds(attempts: number): number {
  const capped = Math.min(attempts, 8);
  const base = 2 ** capped;
  const jitter = Math.floor(Math.random() * 5);
  return base + jitter;
}

async function processEvent(event: OutboxEventRow) {
  if (event.event_type === 'notify_recipient') {
    const payload = event.payload as {
      userId: string;
      actorId: string;
      tipId?: string;
      amount: string;
      currency?: string;
    };
    await createNotification({
      userId: payload.userId,
      type: 'like',
      actorId: payload.actorId,
      entityType: 'tip',
      entityId: payload.tipId,
      message: `You received a ${payload.currency ?? 'USD'} ${payload.amount} tip!`,
    });
    return;
  }

  if (event.event_type === 'award_xp') {
    const payload = event.payload as { userId: string; amount: number; reason: string };
    await awardXP(payload.userId, payload.amount, payload.reason);
    return;
  }

  throw new Error(`Unknown outbox event type: ${event.event_type}`);
}

export async function drainOutbox(batchSize = 50) {
  const supabase = createServiceClient();

  // Bugfix: use DB-side SKIP LOCKED claim RPC for atomic concurrent worker coordination.
  const { data, error } = await supabase.rpc('claim_outbox_events' as never, {
    p_batch_size: Math.min(200, Math.max(1, batchSize)),
  } as never);

  if (error) throw new Error(`drainOutbox claim failed: ${error.message}`);
  const events = (data ?? []) as OutboxEventRow[];

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await processEvent(event);
      await supabase
        .from('outbox_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', event.id)
        .eq('status', 'processing');
      processed += 1;
    } catch (err) {
      failed += 1;
      const terminal = event.attempts >= MAX_ATTEMPTS;
      const nextAttemptAt = new Date(Date.now() + nextDelaySeconds(event.attempts) * 1000).toISOString();
      await supabase
        .from('outbox_events')
        .update({
          status: terminal ? 'failed' : 'pending',
          last_error: err instanceof Error ? err.message : String(err),
          next_attempt_at: terminal ? new Date().toISOString() : nextAttemptAt,
        })
        .eq('id', event.id)
        .eq('status', 'processing');
    }
  }

  recordMetric('outbox_drain_run', { processed, failed, scanned: events.length, batchSize });
  return { processed, failed, scanned: events.length };
}
