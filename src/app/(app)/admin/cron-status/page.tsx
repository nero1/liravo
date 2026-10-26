'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { CRON_JOBS, type CronJobId } from '@/constants/cron';
import type { operationalSnapshot } from '@/lib/operational-alerts';

interface OutboxStats {
  pending: number;
  failed: number;
  anomalies: Record<string, number>;
  operations: Awaited<ReturnType<typeof operationalSnapshot>> | null;
}

export default function CronStatusPage() {
  const t = useTranslations('admin.cron');
  const common = useTranslations('common');
  const formatter = useFormatter();
  const [stats, setStats] = useState<OutboxStats | null>(null);
  const [error, setError] = useState(false);
  const [triggering, setTriggering] = useState<CronJobId | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; status: number; partial: boolean }>>({});

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/admin/cron-status');
        if (!response.ok) throw new Error('Status unavailable');
        const data = await response.json() as OutboxStats;
        if (active) { setStats(data); setError(false); }
      } catch { if (active) setError(true); }
    };
    void refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  async function triggerJob(job: CronJobId) {
    setTriggering(job);
    try {
      const response = await fetch('/api/admin/cron-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job }),
      });
      const data = await response.json() as { partial?: boolean };
      setResults(prev => ({ ...prev, [job]: { ok: response.ok, status: response.status, partial: data.partial === true } }));
    } catch { setResults(prev => ({ ...prev, [job]: { ok: false, status: 0, partial: false } })); }
    finally { setTriggering(null); }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t('title')}</h1>
      {error && <p role="alert" className="text-destructive mb-4">{common('error')}</p>}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {(['pending','failed'] as const).map(key => (
          <div key={key} className="p-4 border border-border rounded-xl">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t(key)}</p>
            <p className={`text-2xl font-bold ${key === 'failed' && stats?.failed ? 'text-destructive' : ''}`}>{stats ? formatter.number(stats[key]) : '–'}</p>
          </div>
        ))}
      </div>
      <h2 className="font-display text-lg font-bold mb-4">{t('integrity')}</h2>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {Object.entries(stats?.anomalies ?? {}).map(([name,count]) => (
          <div key={name} role={count > 0 ? 'alert' : undefined} className={`p-4 border rounded-xl ${count > 0 ? 'border-destructive' : 'border-border'}`}>
            <p className="text-xs text-muted-foreground">{t(`anomalies.${name}`)}</p>
            <p className="text-2xl font-bold">{formatter.number(count)}</p>
          </div>
        ))}
      </div>
      <h2 className="font-display text-lg font-bold mb-4">{t('operations')}</h2>
      {stats && !stats.operations && <p role="alert" className="text-destructive mb-4">{t('operationsUnavailable')}</p>}
      {stats?.operations && <>
        <p className="text-sm text-muted-foreground mb-4">{t('windowStart',{time:formatter.dateTime(new Date(stats.operations.windowStart),{hour:'numeric',minute:'numeric'})})}</p>
        <div className="grid grid-cols-2 gap-3 mb-8">
          {Object.entries(stats.operations.counts).map(([name,count]) => <div key={name} role={stats.operations?.alerts[name as keyof typeof stats.operations.alerts] ? 'alert' : undefined} className={`p-4 border rounded-xl ${stats.operations?.alerts[name as keyof typeof stats.operations.alerts] ? 'border-destructive' : 'border-border'}`}>
            <p className="text-xs text-muted-foreground">{t(`signals.${name}`)}</p>
            <p className="text-2xl font-bold">{formatter.number(count)}</p>
          </div>)}
        </div>
      </>}
      <h2 className="font-display text-lg font-bold mb-4">{t('jobsTitle')}</h2>
      <div className="space-y-2">
        {CRON_JOBS.map(job => (
          <div key={job.id} className="p-4 border border-border rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{t(`jobs.${job.id}.label`)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t(`jobs.${job.id}.description`)}</p>
                {results[job.id] && <p role="status" className={`text-xs mt-1 ${results[job.id].partial ? 'text-amber-700' : results[job.id].ok ? 'text-green-600' : 'text-red-500'}`}>{results[job.id].partial ? t('partial') : results[job.id].ok ? t('success') : results[job.id].status ? t('failure',{status:results[job.id].status}) : common('error')}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">{job.schedule ? `${job.schedule} UTC` : t('external')}</span>
                <button onClick={() => triggerJob(job.id)} disabled={triggering !== null} className="text-xs bg-accent text-white px-3 py-1 rounded-lg hover:opacity-90 disabled:opacity-50">{triggering === job.id ? common('loading') : t('run')}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-6">{t('instructions')}</p>
    </div>
  );
}
