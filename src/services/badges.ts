import { createServiceClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  icon: string;
  trigger: string; // which trigger(s) this badge checks
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first_review',
    name: 'First Review',
    description: 'Wrote your first review',
    xp_reward: 50,
    icon: '✍️',
    trigger: 'review',
  },
  {
    id: 'bookworm',
    name: 'Bookworm',
    description: 'Read 10 books',
    xp_reward: 100,
    icon: '🐛',
    trigger: 'finish_book',
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Following 10 users',
    xp_reward: 50,
    icon: '🦋',
    trigger: 'follow',
  },
  {
    id: 'influencer',
    name: 'Influencer',
    description: 'Gained 100 followers',
    xp_reward: 200,
    icon: '⭐',
    trigger: 'receive_follower',
  },
  {
    id: 'speed_reader',
    name: 'Speed Reader',
    description: 'Read 5 books in a single month',
    xp_reward: 150,
    icon: '⚡',
    trigger: 'finish_book',
  },
  {
    id: 'shelf_builder',
    name: 'Shelf Builder',
    description: 'Created 5 custom shelves',
    xp_reward: 75,
    icon: '🗂️',
    trigger: 'create_shelf',
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintained a 7-day reading streak',
    xp_reward: 50,
    icon: '🔥',
    trigger: 'streak',
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintained a 30-day reading streak',
    xp_reward: 200,
    icon: '🏆',
    trigger: 'streak',
  },
  {
    id: 'connector',
    name: 'Connector',
    description: 'Referred 1 user to Liravo',
    xp_reward: 200,
    icon: '🤝',
    trigger: 'referral',
  },
  {
    id: 'ambassador',
    name: 'Ambassador',
    description: 'Referred 5 users to Liravo',
    xp_reward: 500,
    icon: '🌟',
    trigger: 'referral',
  },
  {
    id: 'liravo_builder',
    name: 'Liravo Builder',
    description: 'Referred 20 users to Liravo',
    xp_reward: 2000,
    icon: '🏗️',
    trigger: 'referral',
  },
];

// user_badges table: id, user_id, badge_id, awarded_at
// Using `any` cast since this table may not be in generated types yet
type UserBadgeRow = {
  id: string;
  user_id: string;
  badge_id: string;
  awarded_at: string;
};

async function hasAwardedBadge(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  badgeId: string
): Promise<boolean> {
  const { data } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('user_badges')
    .select('id')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .maybeSingle();
  return !!data;
}

async function awardBadge(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  badge: BadgeDefinition
): Promise<void> {
  const already = await hasAwardedBadge(supabase, userId, badge.id);
  if (already) return;

  await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('user_badges')
    .insert({ user_id: userId, badge_id: badge.id });

  // Award XP
  await awardXP(userId, badge.xp_reward, `badge:${badge.id}`);

  // Create notification
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'badge_earned',
    message: `${badge.icon} You earned the "${badge.name}" badge! +${badge.xp_reward} XP`,
  });
}

export async function checkAndAwardBadges(
  userId: string,
  trigger: string
): Promise<UserBadgeRow[]> {
  const supabase = createServiceClient();

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('books_read_count, reading_streak')
    .eq('id', userId)
    .single();

  if (!profile) return [];

  const newBadges: UserBadgeRow[] = [];
  const relevantBadges = BADGE_DEFINITIONS.filter((b) => b.trigger === trigger);

  for (const badge of relevantBadges) {
    let qualifies = false;

    switch (badge.id) {
      case 'first_review': {
        const { count } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        qualifies = (count ?? 0) >= 1;
        break;
      }
      case 'bookworm': {
        qualifies = (profile.books_read_count ?? 0) >= 10;
        break;
      }
      case 'social_butterfly': {
        const { count } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', userId);
        qualifies = (count ?? 0) >= 10;
        break;
      }
      case 'influencer': {
        const { count } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', userId);
        qualifies = (count ?? 0) >= 100;
        break;
      }
      case 'speed_reader': {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const { data: shelves } = await supabase
          .from('shelves')
          .select('id')
          .eq('user_id', userId)
          .eq('default_type', 'have_read');
        if (shelves && shelves.length > 0) {
          const shelfIds = shelves.map((s) => s.id);
          const { count } = await supabase
            .from('shelf_books')
            .select('*', { count: 'exact', head: true })
            .in('shelf_id', shelfIds)
            .gte('finished_at', oneMonthAgo.toISOString());
          qualifies = (count ?? 0) >= 5;
        }
        break;
      }
      case 'shelf_builder': {
        const { count } = await supabase
          .from('shelves')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_default', false);
        qualifies = (count ?? 0) >= 5;
        break;
      }
      case 'streak_7': {
        qualifies = (profile.reading_streak ?? 0) >= 7;
        break;
      }
      case 'streak_30': {
        qualifies = (profile.reading_streak ?? 0) >= 30;
        break;
      }
      case 'connector': {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('referred_by', userId);
        qualifies = (count ?? 0) >= 1;
        break;
      }
      case 'ambassador': {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('referred_by', userId);
        qualifies = (count ?? 0) >= 5;
        break;
      }
      case 'liravo_builder': {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('referred_by', userId);
        qualifies = (count ?? 0) >= 20;
        break;
      }
    }

    if (qualifies) {
      await awardBadge(supabase, userId, badge);
    }
  }

  return newBadges;
}
