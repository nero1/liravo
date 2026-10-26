import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// reading_list_books table not in generated types — using any cast

const AddBookSchema = z.object({
  book_id: z.string().uuid(),
});

const RemoveBookSchema = z.object({
  book_id: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AddBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  // Verify the list belongs to the user
  const { data: list } = await supabase 
    .from('reading_lists')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!list) {
    return NextResponse.json({ error: 'List not found or not authorized' }, { status: 404 });
  }

  const { error } = await supabase 
    .from('reading_list_books')
    .upsert({ list_id: params.id, book_id: parsed.data.book_id });

  if (error) {
    return NextResponse.json({ error: 'Failed to add book' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = RemoveBookSchema.safeParse({ book_id: searchParams.get('book_id') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing book_id' }, { status: 400 });
  }

  // Verify ownership
  const { data: list } = await supabase 
    .from('reading_lists')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!list) {
    return NextResponse.json({ error: 'List not found or not authorized' }, { status: 404 });
  }

  const {error}=await supabase
    .from('reading_list_books')
    .delete()
    .eq('list_id', params.id)
    .eq('book_id', parsed.data.book_id);

  if(error)return NextResponse.json({error:'Failed to remove book'},{status:503});
  return NextResponse.json({ success: true });
}
