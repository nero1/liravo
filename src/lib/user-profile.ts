import type {NotificationPreferences} from '@/lib/notification-preferences';
import type { UserRow } from '@/types/database';

export const PUBLIC_USER_COLUMNS = 'id,username,display_name,bio,avatar_url,banner_url,country,user_types,genres,is_admin,is_premium,preferred_locale,is_moderator,is_verified_author,is_creator,is_suspended,is_banned,suspension_reason,xp,reading_streak,max_reading_streak,streak_freeze_tokens,last_streak_date,annual_reading_goal,books_read_count,referral_code,referred_by,email_verified,totp_enabled,external_links,profile_visibility,shelf_visibility,show_referrer,onboarding_complete,email_prompt_shown_at,email_prompt_dismissed_at,created_at,updated_at' as const;
export const OWN_USER_COLUMNS = `${PUBLIC_USER_COLUMNS},email,email_digest_enabled,notify_follows,notify_likes,notify_replies,notify_mentions,notify_author_announcements,notify_new_releases,notify_challenge_completions,notify_arc_grants` as const;
export type PublicUserRow = Omit<UserRow, 'email' | 'pin_hash' | 'totp_secret' | 'recovery_codes' | keyof NotificationPreferences>;

const clientFields = new Set([...OWN_USER_COLUMNS.split(','), 'writing_streak', 'last_writing_date', 'writing_freeze_tokens', 'max_reading_streak', 'email_digest_enabled', 'notify_follows', 'notify_likes', 'notify_replies', 'notify_mentions', 'notify_author_announcements', 'notify_new_releases', 'notify_challenge_completions', 'notify_arc_grants']);

/** Allowlist authenticated profile responses; new DB columns are private by default. */
export function clientUser(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) => clientFields.has(key)));
}
