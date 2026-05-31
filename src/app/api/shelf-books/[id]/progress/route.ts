import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { progress_pages?: number; progress_percent?: number };

  // Fetch shelf book to verify ownership and get book page_count
  const { data: shelfBook } = await supabase
    .from('shelf_books')
    .select('id, user_id, book_id, books:book_id(page_count)')
    .eq('id', params.id)
    .single();

  if (!shelfBook || shelfBook.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const book = shelfBook.books as unknown as { page_count: number | null } | null;
  const pageCount = book?.page_count ?? null;

  const updates: { progress_pages?: number; progress_percent?: number } = {};

  if (typeof body.progress_pages === 'number') {
    updates.progress_pages = body.progress_pages;
    if (pageCount && pageCount > 0) {
      updates.progress_percent = Math.min(100, Math.round((body.progress_pages / pageCount) * 100));
    }
  } else if (typeof body.progress_percent === 'number') {
    updates.progress_percent = Math.min(100, Math.max(0, body.progress_percent));
  }

  const { data: updated, error } = await supabase
    .from('shelf_books')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Award XP for updating progress
  await awardXP(user.id, XP_CONFIG.WANT_TO_READ_REACTION, 'progress_update');

  return NextResponse.json(updated);
}
