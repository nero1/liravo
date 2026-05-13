import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// book_passes table may not exist — fallback to notifications table with type='book_pass'

const PassBookSchema = z.object({
  book_id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  message: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PassBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { book_id, recipient_id, message } = parsed.data;

  // Verify the book exists
  const { data: book } = await supabase
    .from('books')
    .select('id, title, author_name')
    .eq('id', book_id)
    .single();

  if (!book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  // Verify the recipient is followed by sender (social graph check)
  const { data: followCheck } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('following_id', recipient_id)
    .maybeSingle();

  if (!followCheck) {
    return NextResponse.json({ error: 'You can only pass books to users you follow' }, { status: 403 });
  }

  // Get sender display name
  const { data: senderProfile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .single();

  // Try to store in book_passes table first
  const { error: passError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('book_passes')
    .insert({
      sender_id: user.id,
      recipient_id,
      book_id,
      message: message ?? null,
    });

  if (passError) {
    // Fallback: store in notifications table
    await supabase.from('notifications').insert({
      user_id: recipient_id,
      type: 'book_pass',
      actor_id: user.id,
      entity_type: 'book',
      entity_id: book_id,
      message: message
        ? `${senderProfile?.display_name ?? 'Someone'} passed you "${book.title}" — "${message}"`
        : `${senderProfile?.display_name ?? 'Someone'} passed you "${book.title}" by ${book.author_name}`,
    });
  } else {
    // Also send notification
    await supabase.from('notifications').insert({
      user_id: recipient_id,
      type: 'book_pass',
      actor_id: user.id,
      entity_type: 'book',
      entity_id: book_id,
      message: message
        ? `${senderProfile?.display_name ?? 'Someone'} passed you "${book.title}" — "${message}"`
        : `${senderProfile?.display_name ?? 'Someone'} passed you "${book.title}" by ${book.author_name}`,
    });
  }

  return NextResponse.json({ success: true });
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get passes from book_passes table if it exists
  const { data: receivedPasses } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('book_passes')
    .select('id, sender_id, book_id, message, created_at')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: sentPasses } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('book_passes')
    .select('id, recipient_id, book_id, message, created_at')
    .eq('sender_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    received: receivedPasses ?? [],
    sent: sentPasses ?? [],
  });
}
