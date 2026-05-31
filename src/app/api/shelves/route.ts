import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// GET /api/shelves?bookId=xxx — list user's shelves and which ones contain bookId
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get('bookId');

  const { data: shelves } = await supabase
    .from('shelves')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false });

  let addedToShelves: string[] = [];
  if (bookId) {
    const { data: existing } = await supabase
      .from('shelf_books')
      .select('shelf_id')
      .eq('book_id', bookId)
      .eq('user_id', user.id);
    addedToShelves = (existing ?? []).map((e: { shelf_id: string }) => e.shelf_id);
  }

  return NextResponse.json({ shelves: shelves ?? [], addedToShelves });
}
