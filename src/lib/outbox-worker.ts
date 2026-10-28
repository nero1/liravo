import { checkAndAwardBadges } from '@/services/badges';
import { sendPushToUser } from '@/lib/push-notifications';
import { createServiceClient } from '@/lib/supabase/server';
import { recordMetric } from '@/lib/metrics';

const MAX_ATTEMPTS = 10;

type OutboxEventRow = {
  id: string;
  aggregate_type?:string;
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
  if(event.event_type==='check_badges')await checkAndAwardBadges(String(event.payload.userId),String(event.payload.trigger));
  const { data, error } = await createServiceClient().rpc('process_outbox_event_atomic' as never, { p_event_id: event.id } as never);
  if (error) throw new Error(`Outbox processing failed: ${error.message}`);
  if (data && ['push_notification', 'notify_recipient'].includes(event.event_type)) {
    const payload = event.payload;
    const type=event.event_type==='notify_recipient'?'tip':typeof payload.notificationType==='string'?payload.notificationType:event.aggregate_type==='follow'||payload.title==='New Follower'?'follow':undefined;
    sendPushToUser(String(payload.userId), {
      title: String(payload.title ?? 'New tip'),
      body: String(payload.body ?? `You received a ${payload.currency ?? 'USD'} ${payload.amount} tip!`),
      url: String(payload.url ?? '/notifications'), tag: `outbox:${event.id}`,notificationType:type,
      messageKey:type==='tip'?'tipAmount':type==='follow'?'follow':undefined,messageValues:type==='tip'?{amount:payload.amount,currency:payload.currency??'USD'}:{},
    }).catch(() => recordMetric('push_delivery_error', { eventId: event.id }, 'warn'));
  }
}

/** Claims up to 200 events; stale claims recover after five minutes and DB effects commit once. */
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
      processed += 1;
    } catch (err) {
      failed += 1;
      const terminal = event.attempts >= MAX_ATTEMPTS;
      const nextAttemptAt = new Date(Date.now() + nextDelaySeconds(event.attempts) * 1000).toISOString();
      const { error: retryError } = await supabase
        .from('outbox_events')
        .update({
          status: terminal ? 'failed' : 'pending',
          last_error: err instanceof Error ? err.message : String(err),
          next_attempt_at: terminal ? new Date().toISOString() : nextAttemptAt,
        })
        .eq('id', event.id)
        .eq('status', 'processing');
      if (retryError) throw new Error(`Outbox retry scheduling failed: ${retryError.message}`);
    }
  }

  recordMetric('outbox_drain_run', { processed, failed, scanned: events.length, batchSize });
  return { processed, failed, scanned: events.length };
}
