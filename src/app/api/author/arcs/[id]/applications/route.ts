import { singleRelation } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// GET /api/author/arcs/[id]/applications — author gets all applications for their ARC
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: arc } = await supabase.from('arcs').select('id, author_id, book_id, description, reader_slots, close_date, is_active, book:book_id(title)').eq('id', params.id).single();
  if (!arc) return NextResponse.json({ error: 'ARC not found' }, { status: 404 });
  if (arc.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('arc_applications')
    .select('id, status, applied_at, reviewed_at, reader:reader_id(id, display_name, username, avatar_url, xp)')
    .eq('arc_id', params.id)
    .order('applied_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({arc:{...arc,title:singleRelation(arc.book)?.title??''},applications:data??[]});
}
