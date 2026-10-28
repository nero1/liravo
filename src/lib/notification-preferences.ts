import type {UserRow} from '../types/database';

export const NOTIFICATION_KEYS=['email_digest_enabled','notify_follows','notify_likes','notify_replies','notify_mentions','notify_author_announcements','notify_new_releases','notify_challenge_completions','notify_arc_grants'] as const;
export type NotificationPreferenceKey=typeof NOTIFICATION_KEYS[number];
export type NotificationPreferences=Pick<UserRow,NotificationPreferenceKey>;
export function readNotificationPreferences(value:unknown):NotificationPreferences{
  if(!value||typeof value!=='object')throw new Error('Notification preferences unavailable');
  return Object.fromEntries(NOTIFICATION_KEYS.map(key=>{
    const flag=(value as Record<string,unknown>)[key];
    if(typeof flag!=='boolean')throw new Error('Notification preferences unavailable');
    return [key,flag];
  })) as NotificationPreferences;
}

export function notificationPreference(type:string,entityType?:string|null):NotificationPreferenceKey|null{
  if(type==='buddy_read_invite'&&entityType==='arc')return 'notify_arc_grants';
  return ({follow:'notify_follows',like:'notify_likes',review_like:'notify_likes',reply:'notify_replies',review_comment:'notify_replies',mention:'notify_mentions',author_announcement:'notify_author_announcements',new_release:'notify_new_releases',challenge_complete:'notify_challenge_completions',arc_granted:'notify_arc_grants'} as Record<string,NotificationPreferenceKey>)[type]??null;
}
