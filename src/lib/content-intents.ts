import { createHash } from 'node:crypto';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/server';

const contentOwners={shelves:'user_id',reviews:'user_id',quotes:'user_id',buddy_reads:'created_by',ask_writer_questions:'user_id',ask_writer_answers:'user_id',reading_sessions:'user_id',
  reading_lists:'user_id',content_reports:'reporter_id',events:'organizer_id',reading_rooms:'created_by',book_debates:'user_id',book_passes:'sender_id',author_posts:'author_id',author_qa:'asked_by',arcs:'author_id',
  workshop_rooms:'facilitator_id',workshop_submissions:'user_id',workshop_feedback:'user_id',buddy_read_notes:'user_id',reading_room_posts:'user_id',reading_room_milestones:'created_by',author_verification_requests:'user_id',appeals:'user_id',community_notes:'author_id'} as const;
type ContentTable=keyof typeof contentOwners;
type ContentRow = Record<string, unknown> & { id: string };
export class ContentIntentError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Durable replay data commits with the inserted row; retries can finish keyed downstream effects. */
export async function contentIntent(request: Request, userId: string, table: ContentTable, payload: Record<string, unknown>) {
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==userId)throw new ContentIntentError('ACCOUNT_CHANGED',409);
  const key = request.headers.get('idempotency-key') ?? request.headers.get('x-idempotency-key');
  if (!key || key.length < 8 || key.length > 200) throw new ContentIntentError('Missing/invalid idempotency key', 400);
  if(!await checkRouteRateLimit(userId,'social'))throw new ContentIntentError('Too many requests',429);
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
      const owner = contentOwners[table];
      const { data, error } = await client.from(table).insert({ ...payload, [owner]: userId, idempotency_key: key, request_hash: fingerprint }).select().single();
      if (error?.code === '23505') {
        const committed = await replay();
        if (committed) return committed;
      }
      if (error || !data) throw new ContentIntentError('Content creation unavailable',({23505:409,P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error?.code??'']??503);
      const committed=await replay();
      if(!committed)throw new ContentIntentError('Committed content response unavailable',503);
      return committed;
    },
  };
}

export async function requireReadingRoomAccess(roomId:string,userId:string) {
  const {data,error}=await createServiceClient().rpc('reading_room_visible' as never,{p_room_id:roomId,p_user_id:userId} as never);
  if(error)throw new ContentIntentError('Room access unavailable',error.code==='22P02'?400:503);
  if(!data)throw new ContentIntentError('Room unavailable',403);
}
