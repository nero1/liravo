import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { getRequestCorrelationId } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';
import { INTEGRITY_SIGNALS, type CronJobId } from '@/constants/cron';
import { z } from 'zod';
import { operationalSnapshot } from '@/lib/operational-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const jobs: Record<CronJobId, () => Promise<{ POST(request: Request): Promise<Response> }>> = {
  'outbox-drain': () => import('@/app/api/cron/outbox-drain/route'),
  'leaderboard-snapshot': () => import('@/app/api/cron/leaderboard-snapshot/route'),
  'shelf-recommendations': () => import('@/app/api/cron/shelf-recommendations/route'),
  'similar-books': () => import('@/app/api/cron/similar-books/route'),
  'generate-prompts': () => import('@/app/api/cron/generate-prompts/route'),
  'ai-writing-plans': () => import('@/app/api/cron/ai-writing-plans/route'),
  'new-release-alerts': () => import('@/app/api/cron/new-release-alerts/route'),
  'reading-goal-milestones': () => import('@/app/api/cron/reading-goal-milestones/route'),
  'account-hardening': () => import('@/app/api/cron/account-hardening/route'),
  'email-digest': () => import('@/app/api/cron/email-digest/route'),
  'taste-profiles': () => import('@/app/api/cron/taste-profiles/route'),
  'affiliate-health': () => import('@/app/api/cron/affiliate-health/route'),
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await isAdmin(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const client = createServiceClient();
  const [pending, failed, snapshot, operations] = await Promise.all([
    client.from('outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    client.rpc('financial_integrity_snapshot' as never),
    operationalSnapshot().catch(() => null),
  ]);
  const anomalies = z.record(z.enum(INTEGRITY_SIGNALS),z.number().int().nonnegative()).safeParse(snapshot.data);
  if (pending.error || failed.error || snapshot.error || !Number.isInteger(pending.count) || !Number.isInteger(failed.count) || !anomalies.success) return NextResponse.json({ error: 'Status unavailable', correlationId: getRequestCorrelationId(request) }, { status: 503 });
  return NextResponse.json({ pending: pending.count ?? 0, failed: failed.count ?? 0, anomalies: anomalies.data, operations });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await isAdmin(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = z.object({ job: z.string().min(1).max(80) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.hasOwn(jobs, parsed.data.job)) return NextResponse.json({ error: 'Invalid job' }, { status: 400 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron unavailable' }, { status: 503 });
  const correlationId = getRequestCorrelationId(request);
  const job = parsed.data.job as CronJobId;
  recordMetric('admin_cron_trigger', { job, userId: user.id, correlationId });
  const handler = await jobs[job]();
  const response = await handler.POST(new Request(`http://internal/api/cron/${job}`, {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'x-request-id': correlationId },
  }));
  const result = await response.json().catch(() => null) as Record<string,unknown> | null;
  const failures = result && (Array.isArray(result.errors) ? result.errors.length : Number(result.errors ?? result.failed ?? 0));
  const alerts = result?.anomalies && typeof result.anomalies === 'object' ? Object.values(result.anomalies).some(value => Number(value) > 0) : false;
  const partial = response.ok && (Number(failures) > 0 || !!alerts);
  recordMetric('admin_cron_result', { job, correlationId, status: response.status, partial }, response.ok && !partial ? 'info' : 'warn');
  return NextResponse.json({ result, partial, correlationId }, { status: response.status, headers: { 'x-request-id': correlationId } });
}
