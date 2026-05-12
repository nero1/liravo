import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bookId = params.id;

  // Check if reaction already exists
  const { data: existing } = await supabase
    .from('shelf_books')
    .select('id')
    .eq('book_id', bookId)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  // We use shelf_books with want_to_read shelf for the want_to_read reaction
  // First find the user's want_to_read shelf
  const { data: wantShelf } = await supabase
    .from('shelves')
    .select('id')
    .eq('user_id', user.id)
    .eq('default_type', 'want_to_read')
    .single();

  if (!wantShelf) {
    return NextResponse.json({ error: 'Want to read shelf not found' }, { status: 404 });
  }

  // Check if already on want_to_read shelf
  const { data: existingEntry } = await supabase
    .from('shelf_books')
    .select('id')
    .eq('book_id', bookId)
    .eq('shelf_id', wantShelf.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingEntry) {
    // Toggle off: remove from shelf
    await supabase
      .from('shelf_books')
      .delete()
      .eq('id', existingEntry.id);

    return NextResponse.json({ reacted: false });
  }

  // Toggle on: add to want_to_read shelf
  const { error } = await supabase
    .from('shelf_books')
    .insert({
      shelf_id: wantShelf.id,
      book_id: bookId,
      user_id: user.id,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Award XP
  await awardXP(user.id, XP_CONFIG.WANT_TO_READ_REACTION, 'want_to_read');

  // Update book want_to_read_count — best effort
  try {
    const { count } = await supabase
      .from('shelf_books')
      .select('id', { count: 'exact', head: true })
      .eq('book_id', bookId);

    if (count !== null) {
      await supabase
        .from('books')
        .update({ want_to_read_count: count })
        .eq('id', bookId);
    }
  } catch {
    // Non-critical
  }

  // Suppress unused variable warning
  void existing;

  return NextResponse.json({ reacted: true });
}
