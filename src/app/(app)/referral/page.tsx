import { createClient } from '@/lib/supabase/server';
import { APP_URL } from '@/constants/config';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Referrals' };

export default async function ReferralPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500">Please log in to view your referral stats.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('users')
    .select('referral_code, display_name')
    .eq('id', user.id)
    .single();

  const { count: referralCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('referred_by', user.id);

  const count = referralCount ?? 0;
  const referralCode = profile?.referral_code ?? '';
  const shareLink = `${APP_URL}?ref=${referralCode}`;

  // Referral leaderboard: top 10 users by referral count
  const { data: leaderboardRaw } = await supabase
    .from('users')
    .select('id, display_name, username')
    .not('referred_by', 'is', null)
    .limit(1000);

  // Count referrals per user
  const refCounts: Record<string, { display_name: string; username: string; count: number }> = {};
  for (const row of leaderboardRaw ?? []) {
    // We need to count who referred each user — fetch top referrers instead
    void row;
  }

  // Better: fetch users grouped by referred_by
  const topReferrersResult = await supabase
    .rpc('get_top_referrers')
    .limit(10);
  const topReferrers = topReferrersResult?.data ?? null;

  // Fallback: fetch users ordered by referral count if RPC not available
  const leaderboard: Array<{ display_name: string; username: string; ref_count: number; rank: number }> = [];
  if (Array.isArray(topReferrers)) {
    (topReferrers as Array<{ display_name: string; username: string; ref_count: number }>).slice(0, 10).forEach((r, i) => {
      leaderboard.push({ ...r, rank: i + 1 });
    });
  }

  // Compute own rank from referral count
  void refCounts;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <h1 className="font-display text-2xl font-bold">Referrals</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-xl text-center">
          <p className="text-3xl font-bold text-accent">{count}</p>
          <p className="text-sm text-neutral-500 mt-1">Friends Referred</p>
        </div>
        <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-xl text-center">
          <p className="text-3xl font-bold text-accent">{(count * 200).toLocaleString()}</p>
          <p className="text-sm text-neutral-500 mt-1">XP Earned</p>
        </div>
      </div>

      {/* Milestones */}
      <section>
        <h2 className="font-semibold text-lg mb-3">Milestones</h2>
        <div className="space-y-3">
          {[
            { target: 1, label: 'Connector Badge', xp: 200 },
            { target: 5, label: 'Ambassador Badge', xp: 500 },
            { target: 10, label: 'Bonus XP Milestone', xp: 500 },
            { target: 20, label: 'Liravo Builder Badge', xp: 2000 },
            { target: 50, label: 'Super Referrer Bonus', xp: 2000 },
          ].map((m) => (
            <div
              key={m.target}
              className={`flex items-center justify-between p-3 rounded-lg border ${count >= m.target ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950' : 'border-neutral-200 dark:border-neutral-700'}`}
            >
              <div>
                <p className="font-medium text-sm">{m.label}</p>
                <p className="text-xs text-neutral-500">{m.target} referral{m.target !== 1 ? 's' : ''} needed</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-accent">+{m.xp} XP</p>
                {count >= m.target && <p className="text-xs text-green-600 dark:text-green-400">Earned!</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Share Link */}
      <section>
        <h2 className="font-semibold text-lg mb-3">Your Referral Link</h2>
        <div className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-xl space-y-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Share this link with friends. When they sign up, you both benefit — you earn <strong>200 XP</strong> per referral.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareLink}
              className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-sm font-mono"
            />
          </div>
          <p className="text-xs text-neutral-500">
            Your referral code: <code className="bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded font-mono">{referralCode}</code>
          </p>
        </div>
      </section>

      {/* Referral Leaderboard */}
      <section>
        <h2 className="font-semibold text-lg mb-3">Referral Leaderboard</h2>
        {leaderboard.length > 0 ? (
          <div className="space-y-2">
            {leaderboard.map((entry) => (
              <div key={entry.username} className="flex items-center gap-3 p-3 border border-border rounded-xl">
                <span className="text-sm font-bold text-muted-foreground w-6">#{entry.rank}</span>
                <Link href={`/@${entry.username}`} className="flex-1 font-medium text-sm hover:underline">
                  {entry.display_name}
                </Link>
                <span className="text-sm font-bold text-accent">{entry.ref_count} referrals</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 border border-dashed border-border rounded-xl text-center text-muted-foreground">
            <p className="text-sm">Be the first to refer friends and top the leaderboard!</p>
            <p className="text-xs mt-1">Your referral count: <strong>{count}</strong></p>
          </div>
        )}
      </section>

      {/* Commissions placeholder */}
      <section>
        <h2 className="font-semibold text-lg mb-3">Commissions</h2>
        <div className="p-4 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl text-center text-neutral-500">
          <p className="text-sm">Affiliate commission tracking coming soon.</p>
          <p className="text-xs mt-1">Earn a percentage when your referrals purchase premium features.</p>
        </div>
      </section>
    </div>
  );
}
