import { createServiceClient } from '@/lib/supabase/server';
import { XP_CONFIG, LEVEL_THRESHOLDS } from '@/constants/config';

export function getLevelTitle(xp: number): string {
  const level = LEVEL_THRESHOLDS.find((l) => xp >= l.min && xp <= l.max);
  return level?.title ?? 'Legend of the Shelf';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function awardXP(userId: string, amount: number, reason: string): Promise<number> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('increment_xp' as never, {
    p_user_id: userId,
    p_amount: amount,
  } as never);

  if (error) {
    // Bugfix: fallback checks errors to avoid silent XP accounting corruption.
    const { data: user, error: userFetchError } = await supabase
      .from('users')
      .select('xp')
      .eq('id', userId)
      .single();
    if (userFetchError) {
      throw new Error(`awardXP fallback read failed (${reason}): ${userFetchError.message}`);
    }

    const newXp = (user?.xp ?? 0) + amount;
    const { error: updateError } = await supabase.from('users').update({ xp: newXp }).eq('id', userId);
    if (updateError) {
      throw new Error(`awardXP fallback write failed (${reason}): ${updateError.message}`);
    }
    return newXp;
  }

  return (data as number) ?? 0;
}

export async function incrementStreak(userId: string) {
  const supabase = createServiceClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: user } = await supabase
    .from('users')
    .select('reading_streak, last_streak_date, streak_freeze_tokens, xp')
    .eq('id', userId)
    .single();

  if (!user) return;

  const lastDate = user.last_streak_date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastDate === today) return; // Already incremented today

  let newStreak = user.reading_streak;
  let newXp = user.xp;

  if (lastDate === yesterdayStr) {
    // Consecutive day
    newStreak += 1;
  } else if (lastDate !== null) {
    // Missed day — check freeze tokens
    if (user.streak_freeze_tokens > 0) {
      await supabase.from('users').update({
        streak_freeze_tokens: user.streak_freeze_tokens - 1,
        last_streak_date: today,
      }).eq('id', userId);
      return;
    }
    newStreak = 1; // Reset streak
  } else {
    newStreak = 1; // First time
  }

  // XP for streak milestones
  if (newStreak === 7) newXp += XP_CONFIG.STREAK_7_DAY;
  if (newStreak === 30) newXp += XP_CONFIG.STREAK_30_DAY;

  // Freeze token awards
  const updates: Record<string, unknown> = {
    reading_streak: newStreak,
    last_streak_date: today,
    xp: newXp,
  };

  if (newStreak === 7 || newStreak === 30) {
    updates.streak_freeze_tokens = (user.streak_freeze_tokens ?? 0) + 1;
  }

  await supabase.from('users').update(updates as never).eq('id', userId);
}
