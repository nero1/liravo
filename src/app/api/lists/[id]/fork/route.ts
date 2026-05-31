import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// reading_lists and reading_list_books tables not in generated types — using any cast

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the original list
  const { data: original } = await supabase 
    .from('reading_lists')
    .select('id, name, description')
    .eq('id', params.id)
    .eq('is_public', true)
    .single();

  if (!original) {
    return NextResponse.json({ error: 'List not found or not public' }, { status: 404 });
  }

  // Create fork
  const { data: forked, error } = await supabase 
    .from('reading_lists')
    .insert({
      user_id: user.id,
      name: `${original.name} (Fork)`,
      description: original.description,
      is_public: false,
    })
    .select()
    .single();

  if (error || !forked) {
    return NextResponse.json({ error: 'Failed to fork list' }, { status: 500 });
  }

  // Copy books
  const { data: originalBooks } = await supabase 
    .from('reading_list_books')
    .select('book_id')
    .eq('list_id', params.id);

  if (originalBooks && originalBooks.length > 0) {
    const inserts = originalBooks.map((b: { book_id: string }) => ({
      list_id: forked.id,
      book_id: b.book_id,
    }));
    await supabase 
      .from('reading_list_books')
      .insert(inserts);
  }

  return NextResponse.json({ list: forked }, { status: 201 });
}
