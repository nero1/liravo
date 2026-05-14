import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModerator } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';

const actionSchema = z.object({
  action: z.enum(['approve', 'remove', 'warn', 'escalate']),
  reason: z.string().max(1000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModerator();
  if (auth instanceof NextResponse) return auth;

  const raw = await request.json();
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { action, reason } = parsed.data;
  const reportId = params.id;
  const supabase = createServiceClient();

  // Fetch the report
  const { data: report, error: fetchError } = await supabase
    .from('content_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (fetchError || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // Determine new status
  const statusMap: Record<string, 'approved' | 'removed' | 'warned' | 'escalated'> = {
    approve: 'approved',
    remove: 'removed',
    warn: 'warned',
    escalate: 'escalated',
  };
  const newStatus = statusMap[action];

  // Update the report
  await supabase
    .from('content_reports')
    .update({
      status: newStatus,
      moderator_id: auth.userId,
      moderator_note: reason ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  // Perform action-specific side effects
  if (action === 'remove') {
    // Soft-delete the reported content based on entity_type
    // content_reports uses entity_type + entity_id
    if (report.entity_type === 'review') {
      await supabase.from('reviews').update({ is_hidden: true, moderation_status: 'removed' }).eq('id', report.entity_id);
    } else if (report.entity_type === 'quote') {
      await supabase.from('quotes').update({ is_hidden: true }).eq('id', report.entity_id);
    } else if (report.entity_type === 'user') {
      await supabase.from('users').update({ is_suspended: true }).eq('id', report.entity_id);
    }
  }

  if (action === 'warn') {
    // Get the content author to notify
    let authorId: string | null = null;

    if (report.entity_type === 'review') {
      const { data: review } = await supabase
        .from('reviews')
        .select('user_id')
        .eq('id', report.entity_id)
        .single();
      authorId = review?.user_id ?? null;
    } else if (report.entity_type === 'quote') {
      const { data: quote } = await supabase
        .from('quotes')
        .select('user_id')
        .eq('id', report.entity_id)
        .single();
      authorId = quote?.user_id ?? null;
    } else if (report.entity_type === 'user') {
      authorId = report.entity_id;
    }

    if (authorId) {
      await supabase
        .from('notifications')
        .insert({
          user_id: authorId,
          type: 'moderation_warning',
          actor_id: auth.userId,
          entity_type: report.entity_type,
          entity_id: report.entity_id,
          message: `Your ${report.entity_type} has received a moderation warning. Reason: ${reason ?? 'Community guidelines violation.'}`,
        });
    }
  }

  if (action === 'escalate') {
    // Notify all admins
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('is_admin', true);

    if (admins && admins.length > 0) {
      const notifs = admins.map((admin) => ({
        user_id: admin.id,
        type: 'moderation_escalation',
        actor_id: auth.userId,
        entity_type: 'content_report',
        entity_id: reportId,
        message: `Report #${reportId} has been escalated for admin review.`,
      }));
      await supabase.from('notifications').insert(notifs);
    }
  }

  // Log to moderation_log table (may not exist in DB type)
  try {
    await supabase
      .from('moderation_log')
      .insert({
        moderator_id: auth.userId,
        report_id: reportId,
        action,
        reason: reason ?? null,
        entity_type: report.entity_type,
        entity_id: report.entity_id,
        created_at: new Date().toISOString(),
      });
  } catch {
    // moderation_log table may not exist yet — non-critical
  }

  return NextResponse.json({ ok: true, action, reportId });
}
