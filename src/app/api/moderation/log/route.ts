import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  const supabase = createServiceClient();

  // moderation_log table may not exist in DB type
  const { data: logs, error } = await supabase
    .from('moderation_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: logs ?? [], page, pageSize: PAGE_SIZE });
}
