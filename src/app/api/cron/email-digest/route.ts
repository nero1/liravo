import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // Validate CRON_SECRET
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get premium users
  const { data: premiumUsers, error } = await supabase
    .from('users')
    .select('id, email, display_name, username')
    .eq('email_verified', true)
    .not('email', 'is', null)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = premiumUsers ?? [];
  let processed = 0;

  for (const user of users) {
    if (!user.email) continue;

    // Gather weekly activity summary
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count: newFollowers } = await supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', user.id)
      .gte('created_at', since);

    const { count: newNotifications } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);

    // Scaffold: log digest info (no real email sent)
    console.log(`[Email Digest] User: ${user.email} (${user.display_name})`);
    console.log(`  - New followers this week: ${newFollowers ?? 0}`);
    console.log(`  - New notifications this week: ${newNotifications ?? 0}`);
    console.log(`  - Profile: /profile/${user.username}`);
    console.log(`  [SCAFFOLD] Email would be sent here via email provider`);

    processed++;
  }

  return NextResponse.json({ processed, message: `Digest scaffold logged for ${processed} users` });
}
