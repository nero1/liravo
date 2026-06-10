import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// GET /api/arcs — public list of active ARCs for readers to browse
export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('arcs')
    .select(`
      id, description, reader_slots, close_date, created_at,
      books:book_id(id, title, author_name, cover_url),
      author:author_id(id, display_name, username, avatar_url),
      arc_applications(id, status, reader_id)
    `)
    .eq('is_active', true)
    .or(`close_date.is.null,close_date.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = (data ?? []).map((arc) => {
    const applications = (arc.arc_applications as Array<{ reader_id: string; status: string }>) ?? [];
    const myApplication = applications.find((a) => a.reader_id === user.id);
    const approvedCount = applications.filter((a) => a.status === 'approved').length;
    return {
      ...arc,
      arc_applications: undefined,
      my_application_status: myApplication?.status ?? null,
      approved_count: approvedCount,
      slots_remaining: arc.reader_slots - approvedCount,
    };
  });

  return NextResponse.json({ arcs: enriched });
}
