import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Creator Dashboard' };

export default async function CreatorDashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, username, avatar_url, is_creator, user_types')
    .eq('id', user.id)
    .single();

  const isCreator =
    profile?.is_creator || (profile?.user_types ?? []).includes('creator');

  if (!isCreator) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-bold mb-4">Creator Access Required</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Set your user type to &quot;Book Content Creator&quot; in your settings to access the creator
          dashboard.
        </p>
        <Link
          href="/settings"
          className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90"
        >
          Go to Settings
        </Link>
      </div>
    );
  }

  // Fetch analytics from API
  let analytics = {
    follower_count: 0,
    review_count: 0,
    want_to_read_triggered: 0,
    tips_received: 0,
  };

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/creator/analytics`,
      {
        headers: { Cookie: '' },
        cache: 'no-store',
      }
    );
    if (res.ok) {
      analytics = await res.json();
    }
  } catch {
    // Use defaults
  }

  // Recent reviews
  const { data: recentReviews } = await supabase
    .from('reviews')
    .select('id, book_id, rating, content, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Creator Dashboard</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
          Track your impact on the Liravo community.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Followers', value: analytics.follower_count },
          { label: 'Reviews Written', value: analytics.review_count },
          { label: 'Want to Read Triggered', value: analytics.want_to_read_triggered },
          { label: 'Tips Received ($)', value: `$${analytics.tips_received.toFixed(2)}` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 text-center"
          >
            <p className="text-2xl font-bold text-accent">{stat.value}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/creator/leaderboard"
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium hover:bg-accent hover:text-white hover:border-accent transition-colors"
        >
          Creator Leaderboard
        </Link>
        <Link
          href="/write"
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium hover:bg-accent hover:text-white hover:border-accent transition-colors"
        >
          Write a Review
        </Link>
      </div>

      {/* Recent Activity */}
      {(recentReviews ?? []).length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold mb-3">Recent Reviews</h2>
          <div className="space-y-3">
            {(recentReviews ?? []).map((review) => (
              <div
                key={review.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-sm ${i < review.rating ? 'text-accent' : 'text-neutral-300 dark:text-neutral-600'}`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
                {review.content && (
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 line-clamp-2">
                    {review.content}
                  </p>
                )}
                <Link
                  href={`/book/${review.book_id}`}
                  className="text-xs text-accent hover:underline mt-1 block"
                >
                  View Book
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
