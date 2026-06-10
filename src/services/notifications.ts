import { createServiceClient } from '@/lib/supabase/server';

export type NotificationType =
  | 'follow'
  | 'like'
  | 'want_to_read'
  | 'reply'
  | 'mention'
  | 'challenge_complete'
  | 'buddy_read_invite'
  | 'author_qa_answer'
  | 'author_announcement'
  | 'arc_granted'
  | 'reading_goal_milestone'
  | 'account_hardening';

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  message: string;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    actor_id: params.actorId ?? null,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    message: params.message,
  });

  // Bugfix: surface write failures instead of silently swallowing them.
  if (error) throw new Error(`createNotification failed: ${error.message}`);
}

export async function markAllRead(userId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(`markAllRead failed: ${error.message}`);
}
