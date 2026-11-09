import { createServiceClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push-notifications';

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
  | 'account_hardening'
  | 'badge_earned'
  | 'book_passed'
  | 'new_question';

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  message: string;
  pushUrl?: string;
  messageKey?:string;
  messageValues?:Record<string,string|number|null>;
}) {
  const supabase = createServiceClient();
  const {data,error}=await supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    actor_id: params.actorId ?? null,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    message: params.message,
    message_key:params.messageKey??null,message_values:params.messageValues??{},
  }).select('id,message_key,message_values').maybeSingle();

  if (error) throw new Error(`createNotification failed: ${error.message}`);

  // Fire-and-forget push notification
  if(!data)return;
  const title='Liravo';
  sendPushToUser(params.userId, {
    title,
    body: params.message,
    url: params.pushUrl ?? '/notifications',
    tag: params.type,notificationType:params.type,entityType:params.entityType,messageKey:data.message_key,messageValues:data.message_values&&typeof data.message_values==='object'&&!Array.isArray(data.message_values)?data.message_values:null,
  }).catch(() => {
    // Non-critical — push failures don't fail the notification write
  });
}

export async function markAllRead(userId: string) {
  const supabase = createServiceClient();
  const {error}=await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(`markAllRead failed: ${error.message}`);
}
