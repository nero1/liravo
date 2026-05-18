import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isModerator } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const mod = await isModerator(user.id);
  if (!mod) redirect('/');

  const serviceSupabase = createServiceClient();

  // Fetch pending count
  const { count: pendingCount } = await serviceSupabase
    .from('content_reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Fetch reports today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayCount } = await serviceSupabase
    .from('content_reports')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Moderation Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Pending Reports</p>
          <p className="text-3xl font-bold text-destructive">{pendingCount ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Reports Today</p>
          <p className="text-3xl font-bold">{todayCount ?? 0}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/moderation/reports"
          className="block bg-card border border-border rounded-xl p-5 hover:bg-muted transition-colors"
        >
          <p className="font-semibold text-lg">Report Queue</p>
          <p className="text-sm text-muted-foreground mt-1">
            Review and action pending user reports
          </p>
        </Link>

        <Link
          href="/moderation/appeals"
          className="block bg-card border border-border rounded-xl p-5 hover:bg-muted transition-colors"
        >
          <p className="font-semibold text-lg">Appeals</p>
          <p className="text-sm text-muted-foreground mt-1">
            Review user appeals against moderation decisions
          </p>
        </Link>

        <Link
          href="/moderation/log"
          className="block bg-card border border-border rounded-xl p-5 hover:bg-muted transition-colors"
        >
          <p className="font-semibold text-lg">Action Log</p>
          <p className="text-sm text-muted-foreground mt-1">
            Full audit trail of all moderation actions (admin only)
          </p>
        </Link>
      </div>
    </div>
  );
}
