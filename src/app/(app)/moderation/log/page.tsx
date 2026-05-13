import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';

const PAGE_SIZE = 20;

interface Props {
  searchParams: { page?: string };
}

interface ModerationLogRow {
  id: string;
  moderator_id: string;
  report_id: string | null;
  action: string;
  reason: string | null;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

export default async function ModerationLogPage({ searchParams }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const admin = await isAdmin(user.id);
  if (!admin) redirect('/moderation');

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));

  const serviceSupabase = createServiceClient();

  // moderation_log table may not exist in DB type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logs, error } = await (serviceSupabase as any)
    .from('moderation_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/moderation" className="text-sm text-muted-foreground hover:underline">
          Moderation
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold">Action Log</h1>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">
          Could not load log. The moderation_log table may not exist yet.
        </p>
      )}

      {!logs || logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No log entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Action</th>
                <th className="pb-2 pr-4 font-medium">Moderator</th>
                <th className="pb-2 pr-4 font-medium">Content Type</th>
                <th className="pb-2 pr-4 font-medium">Reason</th>
                <th className="pb-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {(logs as ModerationLogRow[]).map((log) => (
                <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {log.moderator_id.slice(0, 8)}...
                  </td>
                  <td className="py-2 pr-4">{log.entity_type}</td>
                  <td className="py-2 pr-4 max-w-xs truncate">
                    {log.reason ?? '-'}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(log.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex gap-2 mt-6">
        {page > 1 && (
          <Link
            href={`/moderation/log?page=${page - 1}`}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors"
          >
            Previous
          </Link>
        )}
        {logs && logs.length === PAGE_SIZE && (
          <Link
            href={`/moderation/log?page=${page + 1}`}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted transition-colors"
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
