import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NominateSchema = z.object({
  nominee_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

// POST /api/pass-the-book/chains/[id]/nominate — pass the book to the next reader
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = NominateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Verify chain exists
  const { data: chain } = await supabase
    .from('pass_the_book_chains')
    .select('id, book_id')
    .eq('id', params.id)
    .single();

  if (!chain) return NextResponse.json({ error: 'Chain not found' }, { status: 404 });

  // Check user is in the chain (must be a node already, or the creator's node at pos 0)
  const { data: userNode } = await supabase
    .from('pass_the_book_nodes')
    .select('id, nominee_id')
    .eq('chain_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!userNode) return NextResponse.json({ error: 'You are not part of this chain' }, { status: 403 });
  if (userNode.nominee_id) return NextResponse.json({ error: 'You have already passed this book' }, { status: 409 });

  // Can't nominate self
  if (parsed.data.nominee_id === user.id) {
    return NextResponse.json({ error: 'You cannot pass the book to yourself' }, { status: 400 });
  }

  // Check nominee is not already in the chain
  const { data: existing } = await supabase
    .from('pass_the_book_nodes')
    .select('id')
    .eq('chain_id', params.id)
    .eq('user_id', parsed.data.nominee_id)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'This reader is already in the chain' }, { status: 409 });

  // Get current max position
  const { data: nodes } = await supabase
    .from('pass_the_book_nodes')
    .select('position')
    .eq('chain_id', params.id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPos = ((nodes ?? [])[0]?.position ?? 0) + 1;

  // Update current user's node to set nominee_id
  await supabase.from('pass_the_book_nodes')
    .update({ nominee_id: parsed.data.nominee_id })
    .eq('id', userNode.id);

  // Add nominee as next node
  await supabase.from('pass_the_book_nodes').insert({
    chain_id: params.id,
    user_id: parsed.data.nominee_id,
    position: nextPos,
    note: parsed.data.note ?? null,
  });

  // Notify the nominee
  const serviceSupabase = createServiceClient();
  const { data: passers } = await supabase.from('users').select('display_name').eq('id', user.id).single();
  const { data: bookData } = await supabase.from('books').select('title').eq('id', chain.book_id).single();

  serviceSupabase.from('notifications').insert({
    user_id: parsed.data.nominee_id,
    type: 'book_pass',
    actor_id: user.id,
    entity_type: 'pass_the_book_chain',
    entity_id: params.id,
    message: `${passers?.display_name ?? 'Someone'} passed the book "${bookData?.title ?? 'a book'}" to you in a chain!`,
  }).then(() => {});

  return NextResponse.json({ success: true, position: nextPos });
}
