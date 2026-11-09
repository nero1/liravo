import { createServiceClient } from '@/lib/supabase/server';
import { LEVEL_THRESHOLDS } from '@/constants/config';

export function getLevelTitle(xp: number): string {
  const level = LEVEL_THRESHOLDS.find((l) => xp >= l.min && xp <= l.max);
  return level?.title ?? 'Legend of the Shelf';
}

/** A stable business event key makes retries safe; missing RPCs fail closed. */
export async function awardXP(userId: string, amount: number, reason: string, eventKey: string): Promise<number> {
  const { data, error } = await createServiceClient().rpc('award_xp_once', {
    p_user_id: userId, p_amount: amount, p_reason: reason, p_event_key: eventKey,
  });
  if (error) throw new Error(`XP reward failed (${reason}): ${error.message}`);
  return (data as { xp: number }).xp;
}

export async function incrementStreak(userId: string) {
  const { error } = await createServiceClient().rpc('increment_streak_atomic', { p_user_id: userId, p_kind: 'reading' });
  if (error) throw new Error('Reading streak update unavailable');
}
