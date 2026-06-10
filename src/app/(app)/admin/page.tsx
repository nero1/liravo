import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import Decimal from 'decimal.js';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin Dashboard — Liravo' };

const QUICK_LINKS = [
  { label: 'Users', href: '/admin/users', icon: '👥' },
  { label: 'Books', href: '/admin/books', icon: '📚' },
  { label: 'Reports', href: '/admin/reports', icon: '🚩' },
  { label: 'Feature Flags', href: '/admin/feature-flags', icon: '⚑' },
  { label: 'Affiliate Stores', href: '/admin/affiliate-stores', icon: '🔗' },
  { label: 'Promoted Listings', href: '/admin/promoted-listings', icon: '★' },
  { label: 'Seasonal Events', href: '/admin/seasonal-events', icon: '🎉' },
  { label: 'Writing Challenges', href: '/admin/writing-challenges', icon: '✍️' },
  { label: 'Auth Providers', href: '/admin/auth-providers', icon: '🔐' },
  { label: 'Theme', href: '/admin/theme', icon: '🎨' },
  { label: 'Cron Status', href: '/admin/cron-status', icon: '⏱' },
  { label: 'Seed Content', href: '/admin/seed', icon: '🌱' },
];

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/');

  // Gather stats
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const todayMidnight = `${today}T00:00:00.000Z`;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const [
    { count: totalUsers },
    { count: totalBooks },
    { count: totalReviews },
    { count: reportsPending },
    { count: dau },
    { count: wau },
    { count: mau },
    { count: newSignupsToday },
    { count: newSignupsThisWeek },
    { count: affiliateClicksToday },
    { count: pendingAuthorVerifications },
    { count: activeSeasonalEvents },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('books').select('id', { count: 'exact', head: true }),
    supabase.from('reviews').select('id', { count: 'exact', head: true }),
    supabase
      .from('content_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    // DAU: users with last_streak_date = today
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('last_streak_date', today),
    // WAU: users with last_streak_date >= 7 days ago
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_streak_date', sevenDaysAgo.split('T')[0]),
    // MAU: users with last_streak_date >= 30 days ago
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_streak_date', thirtyDaysAgo.split('T')[0]),
    // New signups today
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayMidnight),
    // New signups this week
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo),
    // Affiliate clicks today
    supabase
      .from('affiliate_link_clicks')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayMidnight),
    // Pending author verifications
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_verified_author', false)
      .contains('user_types', ['author']),
    // Active seasonal events
    supabase
      .from('seasonal_events')
      .select('id', { count: 'exact', head: true })
      .lte('start_date', nowIso)
      .gte('end_date', nowIso)
      .eq('is_active', true),
  ]);

  // Revenue this month (tips + subscriptions)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: tips } = await supabase
    .from('tips')
    .select('platform_fee')
    .eq('status', 'completed')
    .gte('created_at', monthStart.toISOString());

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('amount')
    .eq('status', 'active')
    .gte('created_at', monthStart.toISOString());

  const tipRevenue = (tips ?? []).reduce(
    (acc: Decimal, t: { platform_fee: string }) => acc.plus(new Decimal(t.platform_fee ?? 0)),
    new Decimal(0)
  );
  const subRevenue = (subs ?? []).reduce(
    (acc: Decimal, s: { amount: string }) => acc.plus(new Decimal(s.amount ?? 0)),
    new Decimal(0)
  );
  const revenueThisMonth = tipRevenue.plus(subRevenue).toFixed(2);

  const stats = [
    { label: 'Total Users', value: (totalUsers ?? 0).toLocaleString() },
    { label: 'Total Books', value: (totalBooks ?? 0).toLocaleString() },
    { label: 'Total Reviews', value: (totalReviews ?? 0).toLocaleString() },
    { label: 'Reports Pending', value: (reportsPending ?? 0).toString() },
    { label: 'Revenue This Month', value: `$${revenueThisMonth}` },
  ];

  const activityStats = [
    { label: 'DAU (today)', value: (dau ?? 0).toLocaleString() },
    { label: 'WAU (7 days)', value: (wau ?? 0).toLocaleString() },
    { label: 'MAU (30 days)', value: (mau ?? 0).toLocaleString() },
    { label: 'New Signups Today', value: (newSignupsToday ?? 0).toString() },
    { label: 'New Signups This Week', value: (newSignupsThisWeek ?? 0).toString() },
    { label: 'Affiliate Clicks Today', value: (affiliateClicksToday ?? 0).toString() },
    { label: 'Active Events', value: (activeSeasonalEvents ?? 0).toString() },
    { label: 'Pending Author Verifications', value: (pendingAuthorVerifications ?? 0).toString(), href: '/admin/users?filter=pending_authors' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="font-bold text-xl">{s.value}</p>
          </div>
        ))}
      </div>

      <h2 className="font-semibold text-lg mb-3 mt-6">Activity</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {activityStats.map((s) => (
          s.href ? (
            <Link key={s.label} href={s.href} className="rounded-xl border border-border bg-card p-4 hover:bg-muted transition-colors">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className="font-bold text-xl">{s.value}</p>
            </Link>
          ) : (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className="font-bold text-xl">{s.value}</p>
            </div>
          )
        ))}
      </div>

      <h2 className="font-semibold text-lg mb-4">Quick Links</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 hover:bg-muted transition-colors"
          >
            <span className="text-xl">{link.icon}</span>
            <span className="font-medium text-sm">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
