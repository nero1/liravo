import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CreateChainSchema = z.object({
  book_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

// GET /api/pass-the-book/chains — list public chains with book + node summary
export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: chains, error } = await supabase
    .from('pass_the_book_chains')
    .select(`
      id, created_at,
      books:book_id(id, title, author_name, cover_url),
      nodes:pass_the_book_nodes(id, user_id, nominee_id, note, position, created_at,
        reader:user_id(id, display_name, username, avatar_url),
        nominee:nominee_id(id, display_name, username, avatar_url)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ chains: chains ?? [] });
}

// POST /api/pass-the-book/chains — start a new chain
export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = CreateChainSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { data: book } = await supabase.from('books').select('id, title').eq('id', parsed.data.book_id).single();
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  // Create chain
  const { data: chain, error: chainError } = await supabase
    .from('pass_the_book_chains')
    .insert({ book_id: parsed.data.book_id, creator_id: user.id })
    .select()
    .single();

  if (chainError) return NextResponse.json({ error: chainError.message }, { status: 500 });

  // Add creator as first node
  const { error: nodeError } = await supabase
    .from('pass_the_book_nodes')
    .insert({ chain_id: chain.id, user_id: user.id, position: 0, note: parsed.data.note ?? null });

  if (nodeError) return NextResponse.json({ error: nodeError.message }, { status: 500 });

  return NextResponse.json({ chain }, { status: 201 });
}
