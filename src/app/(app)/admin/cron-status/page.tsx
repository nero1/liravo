'use client';

import { useState, useEffect } from 'react';

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

interface OutboxStats {
  pending: number;
  failed: number;
}

export default function CronStatusPage() {
  const [stats, setStats] = useState<OutboxStats | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  useEffect(() => {
    fetch('/api/admin/cron-status')
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => null);
  }, []);

  async function triggerJob(job: typeof CRON_JOBS[0]) {
    setTriggering(job.id);
    try {
      const res = await fetch(job.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
      });
      const ok = res.ok;
      let message = ok ? 'Triggered successfully' : `Failed (${res.status})`;
      try {
        const d = await res.json() as { message?: string; error?: string };
        message = d.message ?? d.error ?? message;
      } catch { /* ignore */ }
      setResults((prev) => ({ ...prev, [job.id]: { ok, message } }));
    } catch {
      setResults((prev) => ({ ...prev, [job.id]: { ok: false, message: 'Network error' } }));
    }
    setTriggering(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Cron & System Status</h1>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pending Outbox Events</p>
          <p className="text-2xl font-bold">{stats?.pending ?? '–'}</p>
        </div>
        <div className="p-4 border border-border rounded-xl">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Failed Outbox Events</p>
          <p className={`text-2xl font-bold ${(stats?.failed ?? 0) > 0 ? 'text-destructive' : ''}`}>
            {stats?.failed ?? '–'}
          </p>
        </div>
      </div>

      <h2 className="font-display text-lg font-bold mb-4">Cron Jobs</h2>
      <div className="space-y-2">
        {CRON_JOBS.map((job) => (
          <div key={job.id} className="p-4 border border-border rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{job.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>
                <code className="text-xs text-muted-foreground mt-1 block">{job.endpoint}</code>
                {results[job.id] && (
                  <p className={`text-xs mt-1 font-medium ${results[job.id].ok ? 'text-green-600' : 'text-red-500'}`}>
                    {results[job.id].message}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                  {job.schedule}
                </span>
                <button
                  onClick={() => triggerJob(job)}
                  disabled={triggering === job.id}
                  className="text-xs bg-accent text-white px-3 py-1 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {triggering === job.id ? '…' : 'Run'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Use the <strong>Run</strong> button to manually trigger any job (requires <code>CRON_SECRET</code> env var to be set as <code>NEXT_PUBLIC_CRON_SECRET</code> for admin use).
        All sub-daily cron jobs should be configured on cron-job.org. See <code>docs/SETUP.md</code> for full cron configuration.
      </p>
    </div>
  );
}
