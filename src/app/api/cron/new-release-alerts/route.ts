import { cron } from '@/lib/cron';
/**
 * Cron: New Release Alerts
 * Sends email alerts to paid followers when a verified author announces a new release.
 * Only sends to paid users with verified email who have opted in — per PRD §7.11.
 * Triggered by cron-job.org or called manually after an author creates a post.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendEmail, buildNewReleaseEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

async function run() {

  const supabase = createServiceClient();

  // Find unprocessed new-release author posts from the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: posts } = await supabase
    .from('author_posts')
    .select('id, author_id, title, book_id')
    .gte('created_at', since)
    .not('book_id', 'is', null)
    .limit(50);

  if (!posts || posts.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No new releases in the last 24 hours' });
  }

  let totalSent = 0;

  for (const post of posts) {
    // Get author info
    const { data: author } = await supabase
      .from('users')
      .select('display_name, username')
      .eq('id', post.author_id)
      .single();

    if (!author) continue;

    // Get book info
    const { data: book } = await supabase
      .from('books')
      .select('title')
      .eq('id', post.book_id)
      .single();

    if (!book) continue;

    // Get paid followers with verified email who haven't been alerted about this post
    const { data: followers } = await supabase
      .from('follows')
      .select('follower_id, user:users!follower_id(email, display_name, email_verified, is_premium,notify_new_releases)')
      .eq('following_id', post.author_id)
      .limit(500);

    const bookUrl = `${APP_URL}/book/${post.book_id}`;

    for (const follow of followers ?? []) {
      const user = (follow.user as unknown) as {
        email: string | null;
        display_name: string | null;
        email_verified: boolean;
        is_premium: boolean;
        notify_new_releases:boolean;
      } | null;

      if (
        !user?.email ||
        !user.email_verified ||
        !user.is_premium ||
        user.notify_new_releases!==true
      ) continue;

      const { subject, html, text } = buildNewReleaseEmail(
        user.display_name ?? 'Reader',
        author.display_name ?? author.username,
        book.title,
        bookUrl
      );

      const result = await sendEmail({
        to: user.email,
        type: 'new_release_alert',
        isPaidUser: true,
        subject,
        html,
        text,
      });

      if (result.ok) totalSent++;
    }
  }

  return NextResponse.json({ sent: totalSent, posts: posts.length });
}

export const GET = cron('new-release-alerts', run);
export const POST = GET;

export const maxDuration = 60;
