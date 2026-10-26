import { createHash } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';

type ContentTable = 'reviews' | 'quotes' | 'buddy_reads' | 'ask_writer_questions' | 'ask_writer_answers' | 'reading_sessions';
type ContentRow = Record<string, unknown> & { id: string };
export class ContentIntentError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Durable replay data commits with the inserted row; retries can finish keyed downstream effects. */
export async function contentIntent(request: Request, userId: string, table: ContentTable, payload: Record<string, unknown>) {
  const key = request.headers.get('idempotency-key') ?? request.headers.get('x-idempotency-key');
  if (!key || key.length < 8 || key.length > 200) throw new ContentIntentError('Missing/invalid idempotency key', 400);
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const client = createServiceClient();
  const replay = async (): Promise<ContentRow | null> => {
    const { data, error } = await client.from('content_intents').select('fingerprint,response').eq('actor_id', userId).eq('action', table).eq('intent_key', key).maybeSingle();
    if (error) throw new ContentIntentError('Intent lookup unavailable', 503);
    if (!data) return null;
    if (data.fingerprint !== fingerprint) throw new ContentIntentError('Conflicting idempotency key', 409);
    return data.response as ContentRow;
  };
  const existing = await replay();
  return {
    existing,
    insert: async (): Promise<ContentRow> => {
      if (existing) return existing;
      const owner = table === 'buddy_reads' ? 'created_by' : 'user_id';
      const { data, error } = await client.from(table).insert({ ...payload, [owner]: userId, idempotency_key: key, request_hash: fingerprint }).select().single();
      if (error?.code === '23505') {
        const committed = await replay();
        if (committed) return committed;
      }
      if (error || !data) throw new ContentIntentError('Content creation unavailable', 503);
      const { idempotency_key: _key, request_hash: _hash, ...row } = data;
      void _key; void _hash;
      return row as ContentRow;
    },
  };
}
