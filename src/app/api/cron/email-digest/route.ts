import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendEmail, buildWeeklyDigestEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Only send digests to paid subscribers who have a verified email and have opted in
  const { data: premiumUsers, error } = await supabase
    .from('users')
    .select('id, email, display_name, username')
    .eq('email_verified', true)
    .eq('is_premium', true)
    .eq('email_digest_enabled', true)
    .not('email', 'is', null)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = premiumUsers ?? [];
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const user of users) {
    if (!user.email) {
      skipped++;
      continue;
    }

    try {
      const [{ count: newFollowers }, { count: newNotifications }, { data: recentBooks }] =
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

      const stats = {
        newFollowers: newFollowers ?? 0,
        newNotifications: newNotifications ?? 0,
        booksThisWeek: (recentBooks as unknown as { length: number } | null)?.length ?? 0,
      };

      // Skip if nothing happened — no email needed
      if (stats.newFollowers === 0 && stats.newNotifications === 0 && stats.booksThisWeek === 0) {
        skipped++;
        continue;
      }

      const { subject, html, text } = buildWeeklyDigestEmail(
        user.display_name ?? user.username,
        user.username,
        stats
      );

      const result = await sendEmail({
        to: user.email,
        type: 'weekly_digest',
        isPaidUser: true,
        subject,
        html,
        text,
      });

      if (result.ok) {
        sent++;
      } else {
        errors.push(`${user.id}: ${result.error}`);
      }
    } catch (err) {
      errors.push(`${user.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors: errors.slice(0, 10),
    message: `Digest sent to ${sent} users, skipped ${skipped}`,
  });
}
