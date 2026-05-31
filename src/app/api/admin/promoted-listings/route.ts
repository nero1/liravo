import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  book_id: z.string().uuid(),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  placement: z.enum(['discover_top', 'book_page_sidebar']),
});

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: admin } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!admin?.is_admin) return null;
  return user;
}

export async function GET() {
  const supabase = createClient();
  const user = await requireAdmin(supabase);

  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('promoted_listings')
    .select('id, book_id, start_date, end_date, placement, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listings: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const user = await requireAdmin(supabase);

  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify book exists
  const { data: book } = await supabase
    .from('books')
    .select('id')
    .eq('id', parsed.data.book_id)
    .single();

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const { data: listing, error } = await supabase
    .from('promoted_listings')
    .insert({
      book_id: parsed.data.book_id,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      placement: parsed.data.placement,
      is_active: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listing }, { status: 201 });
}
