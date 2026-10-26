import { singleRelation } from '@/lib/utils';
import { createServiceClient } from '@/lib/supabase/server';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  icon: string;
  trigger: string;
}

// ─── Reading milestone badges ─────────────────────────────────────────────────
const READING_MILESTONE_BADGES: BadgeDefinition[] = [
  { id: 'first_book', name: 'First Book', description: 'Finished your first book', xp_reward: 50, icon: '📖', trigger: 'finish_book' },
  { id: 'bookworm_10', name: 'Bookworm', description: 'Read 10 books', xp_reward: 100, icon: '🐛', trigger: 'finish_book' },
  { id: 'avid_reader_50', name: 'Avid Reader', description: 'Read 50 books', xp_reward: 500, icon: '📚', trigger: 'finish_book' },
  { id: 'century_reader', name: 'Century Reader', description: 'Read 100 books', xp_reward: 1000, icon: '💯', trigger: 'finish_book' },
  { id: 'streak_365', name: '365-Day Streak', description: 'Maintained a 365-day reading streak', xp_reward: 5000, icon: '🗓️', trigger: 'streak' },
];

// ─── Streak badges ────────────────────────────────────────────────────────────
const STREAK_BADGES: BadgeDefinition[] = [
  { id: 'streak_7', name: 'Week Warrior', description: 'Maintained a 7-day reading streak', xp_reward: 50, icon: '🔥', trigger: 'streak' },
  { id: 'streak_30', name: 'Monthly Master', description: 'Maintained a 30-day reading streak', xp_reward: 200, icon: '🏆', trigger: 'streak' },
];

// ─── Genre badges (5, 20, 50 books per genre) ────────────────────────────────
const GENRE_BADGE_TIERS: Array<{ count: number; suffix: string; xp: number }> = [
  { count: 5, suffix: '_5', xp: 50 },
  { count: 20, suffix: '_20', xp: 200 },
  { count: 50, suffix: '_50', xp: 500 },
];
const GENRE_BADGES_DEF: Array<{ genre: string; id: string; name: string; icon: string }> = [
  { genre: 'Horror', id: 'horror_head', name: 'Horror Head', icon: '👻' },
  { genre: 'Romance', id: 'romance_reader', name: 'Romance Reader', icon: '💕' },
  { genre: 'Science Fiction', id: 'scifi_scholar', name: 'Sci-Fi Scholar', icon: '🚀' },
  { genre: 'Fantasy', id: 'fantasy_wanderer', name: 'Fantasy Wanderer', icon: '🧙' },
  { genre: 'Nonfiction', id: 'nonfiction_thinker', name: 'Nonfiction Thinker', icon: '🧠' },
  { genre: 'Mystery', id: 'mystery_maven', name: 'Mystery Maven', icon: '🔍' },
  { genre: 'Historical Fiction', id: 'historical_traveller', name: 'Historical Traveller', icon: '🏛️' },
  { genre: 'Literary Fiction', id: 'literary_devotee', name: 'Literary Devotee', icon: '🎭' },
];

const GENRE_BADGES: BadgeDefinition[] = GENRE_BADGES_DEF.flatMap((g) =>
  GENRE_BADGE_TIERS.map((t) => ({
    id: `${g.id}${t.suffix}`,
    name: `${g.name} (${t.count})`,
    description: `Read ${t.count} ${g.genre} books`,
    xp_reward: t.xp,
    icon: g.icon,
    trigger: 'finish_book_genre',
  }))
);

// ─── Social badges ────────────────────────────────────────────────────────────
const SOCIAL_BADGES: BadgeDefinition[] = [
  { id: 'connector', name: 'Connector', description: 'Referred 10 users to Liravo', xp_reward: 500, icon: '🤝', trigger: 'referral' },
  { id: 'ambassador', name: 'Ambassador', description: 'Referred 50 users to Liravo', xp_reward: 2000, icon: '🌟', trigger: 'referral' },
  { id: 'liravo_builder', name: 'Liravo Builder', description: 'Referred 200 users to Liravo', xp_reward: 5000, icon: '🏗️', trigger: 'referral' },
  { id: 'influencer', name: 'Influencer', description: 'Triggered 100 want-to-reads with your reviews', xp_reward: 200, icon: '⭐', trigger: 'want_to_read_triggered' },
  { id: 'spark', name: 'Spark', description: 'Your first review triggered a want-to-read', xp_reward: 50, icon: '✨', trigger: 'want_to_read_triggered' },
  { id: 'authors_favourite', name: "Author's Favourite", description: 'A verified author replied to your review', xp_reward: 100, icon: '🎖️', trigger: 'author_reply' },
  { id: 'bookclub_host', name: 'Bookclub Host', description: 'Hosted a Reading Together Room', xp_reward: 100, icon: '🏠', trigger: 'host_reading_room' },
  { id: 'social_butterfly', name: 'Social Butterfly', description: 'Following 10 users', xp_reward: 50, icon: '🦋', trigger: 'follow' },
  { id: 'popular_reader', name: 'Popular Reader', description: 'Gained 100 followers', xp_reward: 200, icon: '👥', trigger: 'receive_follower' },
];

// ─── Writing badges ───────────────────────────────────────────────────────────
const WRITING_BADGES: BadgeDefinition[] = [
  { id: 'first_draft', name: 'First Draft', description: 'Completed your first writing challenge', xp_reward: 100, icon: '📝', trigger: 'challenge_submit' },
  { id: 'workshop_regular', name: 'Workshop Regular', description: 'Participated in 5 writing workshops', xp_reward: 150, icon: '🛠️', trigger: 'workshop_submit' },
  { id: 'prompt_runner', name: 'Prompt Runner', description: 'Completed 30 daily prompts', xp_reward: 300, icon: '🏃', trigger: 'prompt_submit' },
  { id: 'craft_scholar', name: 'Craft Scholar', description: 'Shelved 10 craft writing books', xp_reward: 150, icon: '🎓', trigger: 'finish_book' },
  { id: 'writing_streak_7', name: 'Week Wordsmith', description: 'Maintained a 7-day writing streak', xp_reward: 75, icon: '🔥', trigger: 'writing_streak' },
  { id: 'writing_streak_30', name: 'Monthly Manuscript', description: 'Maintained a 30-day writing streak', xp_reward: 300, icon: '🏆', trigger: 'writing_streak' },
  { id: 'first_prompt', name: 'First Prompt', description: 'Completed your first daily writing prompt', xp_reward: 25, icon: '✏️', trigger: 'prompt_submit' },
  { id: 'prolific_writer', name: 'Prolific Writer', description: 'Written 10,000 words total', xp_reward: 500, icon: '📜', trigger: 'prompt_submit' },
];

// ─── Speed badges ─────────────────────────────────────────────────────────────
const SPEED_BADGES: BadgeDefinition[] = [
  { id: 'sprint_reader', name: 'Sprint Reader', description: 'Finished a book in under 3 days', xp_reward: 100, icon: '⚡', trigger: 'finish_book' },
  { id: 'weekend_warrior_speed', name: 'Weekend Warrior', description: 'Finished a book over a single weekend', xp_reward: 75, icon: '🏖️', trigger: 'finish_book' },
  { id: 'speed_reader_month', name: 'Speed Reader', description: 'Read 5 books in a single month', xp_reward: 150, icon: '💨', trigger: 'finish_book' },
];

// ─── Review badges ────────────────────────────────────────────────────────────
const REVIEW_BADGES: BadgeDefinition[] = [
  { id: 'first_review', name: 'First Review', description: 'Wrote your first review', xp_reward: 50, icon: '✍️', trigger: 'review' },
  { id: 'shelf_builder', name: 'Shelf Builder', description: 'Created 5 custom shelves', xp_reward: 75, icon: '🗂️', trigger: 'create_shelf' },
  { id: 'critic_10', name: 'Junior Critic', description: 'Wrote 10 reviews', xp_reward: 100, icon: '🖊️', trigger: 'review' },
  { id: 'critic_50', name: 'Senior Critic', description: 'Wrote 50 reviews', xp_reward: 300, icon: '📋', trigger: 'review' },
  { id: 'helpful_10', name: 'Helpful Reader', description: 'Received 10 helpful votes on reviews', xp_reward: 100, icon: '👍', trigger: 'review' },
  { id: 'helpful_50', name: 'Trusted Voice', description: 'Received 50 helpful votes on reviews', xp_reward: 300, icon: '🗣️', trigger: 'review' },
];

// ─── Seasonal badges ──────────────────────────────────────────────────────────
export const SEASONAL_BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'winter_reader_2024', name: 'Winter Reader 2024', description: 'Read 3 books during Winter Reading Challenge 2024', xp_reward: 200, icon: '❄️', trigger: 'seasonal' },
  { id: 'summer_bookworm_2025', name: 'Summer Bookworm 2025', description: 'Read 5 books during Summer Reading Challenge 2025', xp_reward: 250, icon: '☀️', trigger: 'seasonal' },
  { id: 'readathon_2025', name: 'Readathon Champion 2025', description: 'Completed the 2025 annual readathon', xp_reward: 500, icon: '🏅', trigger: 'seasonal' },
  { id: 'spooky_reader_oct', name: 'Spooky Reader', description: 'Read 2 horror books during October', xp_reward: 150, icon: '🎃', trigger: 'seasonal' },
  { id: 'cozy_winter_reader', name: 'Cozy Winter Reader', description: 'Read during the holiday cozy reading event', xp_reward: 150, icon: '🕯️', trigger: 'seasonal' },
];

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  ...READING_MILESTONE_BADGES,
  ...STREAK_BADGES,
  ...GENRE_BADGES,
  ...SOCIAL_BADGES,
  ...WRITING_BADGES,
  ...SPEED_BADGES,
  ...REVIEW_BADGES,
  ...SEASONAL_BADGE_DEFINITIONS,
];

// ─── Helper types ─────────────────────────────────────────────────────────────
type Supabase = ReturnType<typeof createServiceClient>;

async function awardBadge(supabase: Supabase, userId: string, badge: BadgeDefinition): Promise<void> {
  const {error}=await supabase.rpc('award_badge_atomic' as never,{p_user_id:userId,p_badge_id:badge.id,p_xp:badge.xp_reward,p_name:badge.name,p_icon:badge.icon} as never);
  if(error)throw new Error('Badge award unavailable');
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function checkAndAwardBadges(userId: string, trigger: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from('users')
    .select('books_read_count, reading_streak, writing_streak, xp')
    .eq('id', userId)
    .single();

  if (!profile) return;
  if(trigger==='finish_book'){
    const {data:completed,error}=await supabase.rpc('count_verified_books' as never,{p_user_id:userId} as never);
    if(error||typeof completed!=='number')throw new Error('Reading milestones unavailable');
    profile.books_read_count=completed;
  }

  const relevantBadges = BADGE_DEFINITIONS.filter((b) => b.trigger === trigger);

  for (const badge of relevantBadges) {
    let qualifies = false;

    switch (badge.id) {
      // ── Reading milestones ──
      case 'first_book': qualifies = (profile.books_read_count ?? 0) >= 1; break;
      case 'bookworm_10': qualifies = (profile.books_read_count ?? 0) >= 10; break;
      case 'avid_reader_50': qualifies = (profile.books_read_count ?? 0) >= 50; break;
      case 'century_reader': qualifies = (profile.books_read_count ?? 0) >= 100; break;

      // ── Reading streaks ──
      case 'streak_7': qualifies = (profile.reading_streak ?? 0) >= 7; break;
      case 'streak_30': qualifies = (profile.reading_streak ?? 0) >= 30; break;
      case 'streak_365': qualifies = (profile.reading_streak ?? 0) >= 365; break;

      // ── Writing streaks (use writing_streak field) ──
      case 'writing_streak_7': qualifies = (profile.writing_streak ?? 0) >= 7; break;
      case 'writing_streak_30': qualifies = (profile.writing_streak ?? 0) >= 30; break;

      // ── Reviews ──
      case 'first_review': {
        const { count } = await supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        qualifies = (count ?? 0) >= 1; break;
      }
      case 'critic_10': {
        const { count } = await supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        qualifies = (count ?? 0) >= 10; break;
      }
      case 'critic_50': {
        const { count } = await supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        qualifies = (count ?? 0) >= 50; break;
      }
      case 'helpful_10': {
        const { data: rv } = await supabase.from('reviews').select('helpful_votes').eq('user_id', userId);
        const total = (rv ?? []).reduce((s: number, r: { helpful_votes?: number }) => s + (r.helpful_votes ?? 0), 0);
        qualifies = total >= 10; break;
      }
      case 'helpful_50': {
        const { data: rv } = await supabase.from('reviews').select('helpful_votes').eq('user_id', userId);
        const total = (rv ?? []).reduce((s: number, r: { helpful_votes?: number }) => s + (r.helpful_votes ?? 0), 0);
        qualifies = total >= 50; break;
      }

      // ── Social: following ──
      case 'social_butterfly': {
        const { count } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
        qualifies = (count ?? 0) >= 10; break;
      }

      // ── Social: followers ──
      case 'popular_reader': {
        const { count } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
        qualifies = (count ?? 0) >= 100; break;
      }

      // ── Referral badges (CORRECT thresholds: 10, 50, 200) ──
      case 'connector': {
        const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('referred_by', userId);
        qualifies = (count ?? 0) >= 10; break;
      }
      case 'ambassador': {
        const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('referred_by', userId);
        qualifies = (count ?? 0) >= 50; break;
      }
      case 'liravo_builder': {
        const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('referred_by', userId);
        qualifies = (count ?? 0) >= 200; break;
      }

      // ── Influencer: 100 want-to-reads triggered ──
      case 'influencer': {
        const { count } = await supabase.from('shelf_books').select('*', { count: 'exact', head: true }).eq('added_by_reviewer_id', userId);
        qualifies = (count ?? 0) >= 100; break;
      }

      // ── Spark: first want-to-read triggered ──
      case 'spark': {
        const { count } = await supabase.from('shelf_books').select('*', { count: 'exact', head: true }).eq('added_by_reviewer_id', userId);
        qualifies = (count ?? 0) >= 1; break;
      }

      // ── Bookclub Host ──
      case 'bookclub_host': {
        const { count } = await supabase.from('reading_rooms').select('*', { count: 'exact', head: true }).eq('created_by', userId);
        qualifies = (count ?? 0) >= 1; break;
      }

      // ── Shelf Builder ──
      case 'shelf_builder': {
        const { count } = await supabase.from('shelves').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_default', false);
        qualifies = (count ?? 0) >= 5; break;
      }

      // ── Writing: first prompt ──
      case 'first_prompt': {
        const { count } = await supabase.from('writing_prompt_submissions').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        qualifies = (count ?? 0) >= 1; break;
      }

      // ── Writing: prompt runner (30 prompts) ──
      case 'prompt_runner': {
        const { count } = await supabase.from('writing_prompt_submissions').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        qualifies = (count ?? 0) >= 30; break;
      }

      // ── Writing: first draft (writing challenge) ──
      case 'first_draft': {
        const { count } = await supabase.from('writing_challenge_submissions').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        qualifies = (count ?? 0) >= 1; break;
      }

      // ── Workshop Regular (5 workshops) ──
      case 'workshop_regular': {
        const {data,error}=await supabase.from('workshop_submissions').select('room_id').eq('user_id',userId);
        if(error)throw new Error('Workshop milestones unavailable');
        qualifies=new Set((data??[]).map(row=>row.room_id)).size>=5; break;
      }

      // ── Prolific Writer (10k words) ──
      case 'prolific_writer': {
        const { data: pSubs } = await supabase.from('writing_prompt_submissions').select('word_count').eq('user_id', userId);
        const { data: cEntries } = await supabase.from('writing_challenge_submissions').select('word_count').eq('user_id', userId);
        const total = (pSubs ?? []).reduce((s: number, r: { word_count?: number }) => s + (r.word_count ?? 0), 0)
          + (cEntries ?? []).reduce((s: number, r: { word_count?: number }) => s + (r.word_count ?? 0), 0);
        qualifies = total >= 10000; break;
      }

      // ── Craft Scholar: shelved 10 craft books ──
      case 'craft_scholar': {
        const craftGenres = ['Writing', 'Craft', 'Creative Writing', 'How to Write'];
        const { data: shelves } = await supabase.from('shelves').select('id').eq('user_id', userId);
        if (shelves && shelves.length > 0) {
          const { data: sb } = await supabase
            .from('shelf_books')
            .select('book_id, books:book_id(genres)')
            .in('shelf_id', shelves.map((s) => s.id))
            .limit(500);
          const craftCount = (sb ?? []).filter((row) =>
            singleRelation(row.books)?.genres?.some((g: string) => craftGenres.some((cg) => g.toLowerCase().includes(cg.toLowerCase())))
          ).length;
          qualifies = craftCount >= 10;
        }
        break;
      }

      // ── Speed Reader: 5 books in one month ──
      case 'speed_reader_month': {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const { data: shelves } = await supabase.from('shelves').select('id').eq('user_id', userId).eq('default_type', 'have_read');
        if (shelves && shelves.length > 0) {
          const { count } = await supabase.from('shelf_books').select('*', { count: 'exact', head: true })
            .in('shelf_id', shelves.map((s) => s.id)).gte('finished_at', oneMonthAgo.toISOString());
          qualifies = (count ?? 0) >= 5;
        }
        break;
      }

      // ── Sprint Reader: book finished in < 3 days ──
      case 'sprint_reader': {
        const { data: shelves } = await supabase.from('shelves').select('id').eq('user_id', userId).eq('default_type', 'have_read');
        if (shelves && shelves.length > 0) {
          const { data: recent } = await supabase.from('shelf_books').select('added_at, finished_at')
            .in('shelf_id', shelves.map((s) => s.id)).not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(20);
          qualifies = (recent ?? []).some((b: { added_at: string; finished_at: string }) => {
            const diff = new Date(b.finished_at).getTime() - new Date(b.added_at).getTime();
            return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
          });
        }
        break;
      }

      // ── Weekend Warrior: finished over a weekend ──
      case 'weekend_warrior_speed': {
        const { data: shelves } = await supabase.from('shelves').select('id').eq('user_id', userId).eq('default_type', 'have_read');
        if (shelves && shelves.length > 0) {
          const { data: recent } = await supabase.from('shelf_books').select('added_at, finished_at')
            .in('shelf_id', shelves.map((s) => s.id)).not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(20);
          qualifies = (recent ?? []).some((b: { added_at: string; finished_at: string }) => {
            const start = new Date(b.added_at);
            const end = new Date(b.finished_at);
            const diff = end.getTime() - start.getTime();
            const startDay = start.getDay();
            // Started Fri/Sat/Sun and finished within 3 days
            return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000 && (startDay === 5 || startDay === 6 || startDay === 0);
          });
        }
        break;
      }

      default: {
        // Genre badges: id format is e.g. 'horror_head_5', 'scifi_scholar_20'
        for (const g of GENRE_BADGES_DEF) {
          for (const t of GENRE_BADGE_TIERS) {
            if (badge.id === `${g.id}${t.suffix}`) {
              const { data: shelves } = await supabase.from('shelves').select('id').eq('user_id', userId);
              if (shelves && shelves.length > 0) {
                const { data: sb } = await supabase
                  .from('shelf_books')
                  .select('book_id, books:book_id(genres)')
                  .in('shelf_id', shelves.map((s) => s.id))
                  .limit(2000);
                const genreCount = (sb ?? []).filter((row) =>
                  singleRelation(row.books)?.genres?.some((gn: string) => gn.toLowerCase().includes(g.genre.toLowerCase()))
                ).length;
                qualifies = genreCount >= t.count;
              }
            }
          }
        }
      }
    }

    if (qualifies) {
      await awardBadge(supabase, userId, badge);
    }
  }
}

// ── Writing streak increment (separate from reading streak) ──────────────────
export async function incrementWritingStreak(userId: string): Promise<void> {
  const { error } = await createServiceClient().rpc('increment_streak_atomic' as never, { p_user_id: userId, p_kind: 'writing' } as never);
  if (error) throw new Error('Writing streak update unavailable');
  await checkAndAwardBadges(userId, 'writing_streak');
}

// ── Award a seasonal badge to a specific user (called from admin endpoint) ────
export async function awardSeasonalBadge(userId: string, badgeId: string): Promise<{ ok: boolean; error?: string }> {
  const badge = SEASONAL_BADGE_DEFINITIONS.find((b) => b.id === badgeId);
  if (!badge) return { ok: false, error: 'Unknown seasonal badge' };
  const supabase = createServiceClient();
  await awardBadge(supabase, userId, badge);
  return { ok: true };
}

// ── Bulk-award a seasonal badge to all qualifying users (called from admin) ───
export async function bulkAwardSeasonalBadge(badgeId: string, userIds: string[]): Promise<{ awarded: number }> {
  let awarded = 0;
  for (const uid of userIds) {
    const result = await awardSeasonalBadge(uid, badgeId);
    if (result.ok) awarded++;
  }
  return { awarded };
}
