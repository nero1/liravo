import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Cron Status — Admin' };

const CRON_JOBS = [
  {
    id: 'leaderboard-snapshot',
    label: 'Leaderboard Snapshot',
    endpoint: '/api/cron/leaderboard-snapshot',
    schedule: 'Nightly (cron-job.org)',
    description: 'Snapshots weekly leaderboard rankings',
  },
  {
    id: 'shelf-recommendations',
    label: 'Shelf Recommendations',
    endpoint: '/api/cron/shelf-recommendations',
    schedule: 'Nightly (cron-job.org)',
    description: 'Pre-computes shelf-overlap book recommendations',
  },
  {
    id: 'email-digest',
    label: 'Email Digest',
    endpoint: '/api/cron/email-digest',
    schedule: 'Weekly (cron-job.org)',
    description: 'Sends weekly digest to paid subscribers with verified email',
  },
  {
    id: 'generate-prompts',
    label: 'Generate Writing Prompts',
    endpoint: '/api/cron/generate-prompts',
    schedule: 'Weekly (cron-job.org)',
    description: 'Generates 7 days of daily writing prompts via AI',
  },
  {
    id: 'ai-writing-plans',
    label: 'AI Writing Plans',
    endpoint: '/api/cron/ai-writing-plans',
    schedule: 'Weekly (cron-job.org)',
    description: 'Generates personalised writing plans for paid Newbie Writer users',
  },
  {
    id: 'taste-profiles',
    label: 'AI Taste Profiles',
    endpoint: '/api/cron/taste-profiles',
    schedule: 'Monthly (cron-job.org)',
    description: 'Refreshes AI taste profiles for paid users',
  },
  {
    id: 'affiliate-health',
    label: 'Affiliate Link Health',
    endpoint: '/api/cron/affiliate-health',
    schedule: 'Nightly (Vercel Cron)',
    description: 'Checks affiliate link health for top 500 books',
  },
  {
    id: 'outbox-drain',
    label: 'Outbox Drain',
    endpoint: '/api/cron/outbox-drain',
    schedule: 'Every 5 min (cron-job.org)',
    description: 'Processes queued outbox events for notifications and side effects',
  },
];

export default async function CronStatusPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) redirect('/');

  // Get pending outbox count as a proxy for system health
  const { count: pendingOutbox } = await supabase
    .from('outbox_events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { count: failedOutbox } = await supabase
    .from('outbox_events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Cron & System Status</h1>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pending Outbox Events</p>
          <p className="text-2xl font-bold">{pendingOutbox ?? 0}</p>
        </div>
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Failed Outbox Events</p>
          <p className={`text-2xl font-bold ${(failedOutbox ?? 0) > 0 ? 'text-destructive' : ''}`}>
            {failedOutbox ?? 0}
          </p>
        </div>
      </div>

      <h2 className="font-display text-lg font-bold mb-4">Cron Jobs</h2>
      <div className="space-y-2">
        {CRON_JOBS.map((job) => (
          <div key={job.id} className="p-4 border border-border rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">{job.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>
                <code className="text-xs text-muted-foreground mt-1 block">{job.endpoint}</code>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                {job.schedule}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        To manually trigger a cron job, send a POST request to its endpoint with the <code>Authorization: Bearer $CRON_SECRET</code> header.
        All sub-daily cron jobs should be configured on cron-job.org pointing to these endpoints.
        See <code>docs/SETUP.md</code> for full cron configuration instructions.
      </p>
    </div>
  );
}
