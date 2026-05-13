import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModerator } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';

const PAGE_SIZE = 20;

const patchSchema = z.object({
  status: z.enum(['pending', 'approved', 'removed', 'warned', 'escalated']).optional(),
  moderator_note: z.string().max(1000).optional(),
});

export async function GET(request: Request) {
  const auth = await requireModerator();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  const supabase = createServiceClient();

  const { data: reports, error, count } = await supabase
    .from('content_reports')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reports: reports ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireModerator();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get('reportId');
  if (!reportId) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
  }

  const raw = await request.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {
    moderator_id: auth.userId,
    ...parsed.data,
  };

  if (parsed.data.status && ['approved', 'removed', 'warned', 'escalated'].includes(parsed.data.status)) {
    updates.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('content_reports')
    .update(updates)
    .eq('id', reportId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: data });
}
