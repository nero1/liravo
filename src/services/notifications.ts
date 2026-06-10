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

const PUSH_TITLES: Record<string, string> = {
  follow: 'New Follower',
  like: 'Someone liked your review',
  want_to_read: 'Added to Want to Read',
  reply: 'New Reply',
  mention: 'You were mentioned',
  challenge_complete: 'Challenge Complete!',
  buddy_read_invite: 'Buddy Read Invite',
  author_qa_answer: 'Author answered your question',
  author_announcement: 'Author Announcement',
  arc_granted: 'ARC Approved!',
  reading_goal_milestone: 'Reading Goal Milestone',
  badge_earned: 'Badge Earned!',
  book_passed: 'Book Passed to You',
  new_question: 'New Reader Question',
};

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  message: string;
  pushUrl?: string;
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

  if (error) throw new Error(`createNotification failed: ${error.message}`);

  // Fire-and-forget push notification
  const title = PUSH_TITLES[params.type] ?? 'Liravo';
  sendPushToUser(params.userId, {
    title,
    body: params.message,
    url: params.pushUrl ?? '/notifications',
    tag: params.type,
  }).catch(() => {
    // Non-critical — push failures don't fail the notification write
  });
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
