import { getRedisClient } from '@/lib/redis';
import { cron, mapBatches } from '@/lib/cron';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendEmail, buildWeeklyDigestEmail } from '@/lib/email';
import { recordMetric } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

async function run() {

  const deadline = Date.now() + 35_000;
  const supabase = createServiceClient();
  const redis = getRedisClient();
  const period = new Date();
  period.setUTCHours(0, 0, 0, 0);
  period.setUTCDate(period.getUTCDate() - (period.getUTCDay() + 6) % 7);
  const periodStart = period.toISOString().slice(0, 10);
  const cursorKey = `cron:email-digest:${periodStart}:cursor`;
  const cursor = await redis.get(cursorKey);

  // Only send digests to paid subscribers who have a verified email and have opted in
  const query = supabase
    .from('users')
    .select('id, email, display_name, username, preferred_locale')
    .eq('email_verified', true)
    .eq('is_premium', true)
    .eq('email_digest_enabled', true)
    .not('email', 'is', null)
    .order('id').limit(40);
  if (cursor) query.gt('id', cursor);
  const { data: premiumUsers, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = premiumUsers ?? [];
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const completed = await mapBatches(users, 4, async user => {
    const { data: claimed, error: claimError } = await supabase.rpc('claim_digest_delivery' as never, { p_user_id: user.id, p_period_start: periodStart } as never);
    if (claimError) throw new Error('Digest claim failed');
    if (!claimed) { skipped++; return; }
    const finish = async (status: string, messageId?: string) => {
      const { error } = await supabase.from('digest_deliveries').update({ status, message_id: messageId ?? null, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('period_start', periodStart);
      if (error) throw new Error('Digest receipt persistence failed');
    };
    if (!user.email) {
      await finish('skipped');
      skipped++;
      return;
    }

    try {
      const counts =
        await Promise.all([
          supabase
            .from('follows')
            .select('follower_id', { count: 'exact', head: true })
            .eq('following_id', user.id)
            .gte('created_at', since),
          supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', since),
          supabase
            .from('shelf_books')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('added_at', since),
        ]);

      if (counts.some(result => result.error)) {
        await finish('failed');
        errors.push(user.id);
        return;
      }
      const stats = {
        newFollowers: counts[0].count ?? 0,
        newNotifications: counts[1].count ?? 0,
        booksThisWeek: counts[2].count ?? 0,
      };

      // Skip if nothing happened — no email needed
      if (stats.newFollowers === 0 && stats.newNotifications === 0 && stats.booksThisWeek === 0) {
        await finish('skipped');
        skipped++;
        return;
      }

      const { subject, html, text } = buildWeeklyDigestEmail(
        user.display_name ?? user.username,
        user.username,
        stats,
        user.preferred_locale
      );

      const result = await sendEmail({
        to: user.email,
        type: 'weekly_digest',
        locale:user.preferred_locale,
        isPaidUser: true,
        subject,
        html,
        text,
      });

      if (result.ok) {
        await finish('sent', result.messageId);
        sent++;
      } else {
        await finish(result.ambiguous ? 'unknown' : 'failed');
        if (result.ambiguous) recordMetric('email_delivery_uncertain', { userId: user.id, periodStart }, 'error');
        errors.push(user.id);
      }
    } catch (err) {
      recordMetric('email_delivery_uncertain', { userId: user.id, periodStart, name: err instanceof Error ? err.name : 'Unknown' }, 'error');
      errors.push(user.id);
    }
  }, deadline);
  if (completed > 0 && (completed < users.length || users.length === 40)) {
    await redis.set(cursorKey, users[completed - 1].id);
    await redis.expire(cursorKey, 8 * 24 * 60 * 60);
  } else {
    await redis.del(cursorKey);
  }

  return NextResponse.json({
    sent,
    skipped,
    errors: errors.slice(0, 10),
    message: `Digest sent to ${sent} users, skipped ${skipped}`,
  });
}

export const GET = cron('email-digest', run);
export const POST = GET;

export const maxDuration = 60;
