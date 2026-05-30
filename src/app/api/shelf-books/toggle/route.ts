import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  shelfId: z.string().uuid(),
  bookId: z.string(),
  action: z.enum(['add', 'remove']),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { shelfId, bookId, action } = parsed.data;
  const service = createServiceClient();

  // Verify shelf belongs to user
  const { data: shelf } = await service
    .from('shelves')
    .select('id, default_type')
    .eq('id', shelfId)
    .eq('user_id', user.id)
    .single();

  if (!shelf) return NextResponse.json({ error: 'Shelf not found' }, { status: 404 });

  if (action === 'remove') {
    await service.from('shelf_books').delete()
      .eq('shelf_id', shelfId)
      .eq('book_id', bookId)
      .eq('user_id', user.id);
  } else {
    await service.from('shelf_books').upsert({
      shelf_id: shelfId,
      book_id: bookId,
      user_id: user.id,
    }, { onConflict: 'shelf_id,book_id' });
  }

  return NextResponse.json({ ok: true, defaultType: shelf.default_type });
}
