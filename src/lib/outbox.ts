import {z}from'zod';
import { createServiceClient } from '@/lib/supabase/server';

export async function enqueueOutboxEvent(params: {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  // Bugfix: persist side-effect intent before asynchronous processing to improve resiliency.
  const { error } = await supabase.from('outbox_events').insert({
    aggregate_type: params.aggregateType,
    aggregate_id: params.aggregateId,
    event_type: params.eventType,
    payload: z.json().parse(params.payload),
    status: 'pending',
  });

  if (error) {
    throw new Error(`enqueueOutboxEvent failed: ${error.message}`);
  }
}
