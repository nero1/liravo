import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// reading_lists table not in generated types — using any cast

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  is_public: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: list, error } = await supabase 
    .from('reading_lists')
    .select('id, user_id, name, description, is_public, created_at, updated_at')
    .eq('id', params.id)
    .single();

  if (error || !list) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if(!list.is_public){
    const user=await getCurrentUser();
    if(list.user_id!==user?.id)return NextResponse.json({error:'Not found'},{status:404});
  }

  // Get books in the list
  const { data: listBooks } = await supabase 
    .from('reading_list_books')
    .select('book_id, added_at')
    .eq('list_id', params.id)
    .order('added_at', { ascending: false });

  const bookIds = (listBooks ?? []).map((b: { book_id: string }) => b.book_id);
  let books: unknown[] = [];
  if (bookIds.length > 0) {
    const { data } = await supabase
      .from('books')
      .select('id, title, author_name, cover_url')
      .in('id', bookIds);
    books = data ?? [];
  }

  return NextResponse.json({ list, books });
}

export async function PATCH(
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

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: list, error } = await supabase 
    .from('reading_lists')
    .update(parsed.data)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !list) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });
  }

  return NextResponse.json({ list });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase 
    .from('reading_lists')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
