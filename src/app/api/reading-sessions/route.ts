import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP, incrementStreak } from '@/services/xp';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const sessionSchema = z.object({
  book_id: z.string().uuid(),
  pages_read: z.number().int().min(1).max(9999).optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

// GET /api/reading-sessions?book_id=... — list user's sessions for a book
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bookId = searchParams.get('book_id');

  const supabase = createClient();
  let query = supabase
    .from('reading_sessions')
    .select('id, book_id, pages_read, started_at, ended_at, notes, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (bookId) query = query.eq('book_id', bookId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

// POST /api/reading-sessions — log a reading session
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Insert session
  let session;
  try {
    const intent = await contentIntent(req, user.id, 'reading_sessions', { book_id: parsed.data.book_id, pages_read: parsed.data.pages_read ?? null, ...(parsed.data.started_at ? { started_at: parsed.data.started_at } : {}), ended_at: parsed.data.ended_at ?? null, notes: parsed.data.notes ?? null });
    session = await intent.insert();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Content creation unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }

  await incrementStreak(user.id);

  // Award 5 XP for logging a session
  await awardXP(user.id, 5, 'reading_session', `reading-session:${session.id}`);

  return NextResponse.json({ session }, { status: 201 });
}
