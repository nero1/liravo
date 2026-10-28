import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isModerator } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';
import { ReportActionForm } from '@/components/moderation/ReportActionForm';
import type { ContentReportRow } from '@/types/database';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

interface Props {
  searchParams: { status?: string; page?: string };
}

const STATUS_TABS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Escalated', value: 'escalated' },
  { label: 'Resolved', value: 'approved' },
];

export default async function ModerationReportsPage({ searchParams }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const mod = await isModerator(user.id);
  if (!mod) redirect('/');

  const status = searchParams.status ?? 'pending';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));

  const serviceSupabase = createServiceClient();
  const { data: reports, count } = await serviceSupabase
    .from('content_reports')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/moderation" className="text-sm text-muted-foreground hover:underline">
          Moderation
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold">Report Queue</h1>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/moderation/reports?status=${tab.value}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              status === tab.value
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Report List */}
      {!reports || reports.length === 0 ? (
        <p className="text-muted-foreground text-sm">No reports with status &quot;{status}&quot;.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((report: ContentReportRow) => (
            <div
              key={report.id}
              className="bg-card border border-border rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mb-1">
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                      {report.entity_type}
                    </span>
                    <span>reported by {report.reporter_id.slice(0, 8)}...</span>
                    <span>{new Date(report.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-medium truncate">
                    Content ID: {report.entity_id}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    Reason: {report.reason}
                  </p>
                  {report.moderator_note && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Note: {report.moderator_note}
                    </p>
                  )}
                </div>
              </div>

              {status === 'pending' || status === 'escalated' ? (
                <ReportActionForm
                  reportId={report.id} userId={user.id}
                  reportedUserId={report.entity_type === 'user' ? report.entity_id : undefined}
                />
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  Status: <span className="font-medium">{report.status}</span>
                  {report.resolved_at && (
                    <> &mdash; resolved {new Date(report.resolved_at).toLocaleDateString()}</>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 mt-6">
          {page > 1 && (
            <Link
              href={`/moderation/reports?status=${status}&page=${page - 1}`}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Previous
            </Link>
          )}
          <span className="px-3 py-1.5 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/moderation/reports?status=${status}&page=${page + 1}`}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
