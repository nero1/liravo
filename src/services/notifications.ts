import { createServiceClient } from '@/lib/supabase/server';

export type NotificationType =
  | 'follow'
  | 'like'
  | 'want_to_read'
  | 'reply'
  | 'mention'
  | 'challenge_complete'
  | 'buddy_read_invite'
  | 'author_qa_answer';

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  message: string;
}) {
  const supabase = createServiceClient();
  await supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    actor_id: params.actorId ?? null,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    message: params.message,
  });
}

export async function markAllRead(userId: string) {
  const supabase = createServiceClient();
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}
