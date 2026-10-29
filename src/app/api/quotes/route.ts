import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import {MAX_QUOTE_PAGE} from '@/lib/content-form-values';
import { sanitizeText,hasVisibleText } from '@/lib/sanitize';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const createQuoteSchema = z.object({
  book_id: z.string().uuid(),
  content: z.string().min(1).max(1000),
  page_number: z.number().int().positive().max(MAX_QUOTE_PAGE).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(()=>null);
  const parsed = createQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const { book_id, page_number } = parsed.data;
  const content = sanitizeText(parsed.data.content);
  if(!hasVisibleText(content))return NextResponse.json({error:'Quote text is required'},{status:400});

  let quote;
  try {
    const intent = await contentIntent(request, user.id, 'quotes', { book_id, content, page_number: page_number ?? null });
    quote = await intent.insert();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Content creation unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }

  // Award XP for posting a quote
  await awardXP(user.id, XP_CONFIG.POST_QUOTE, 'post_quote', `quote:${quote.id}`);

  return NextResponse.json({ quote }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') ?? user.id;
  const bookId = searchParams.get('book_id');
  const cursor = searchParams.get('cursor');
  const limit = 20;

  let query = supabase
    .from('quotes')
    .select(`
      id, content, page_number, created_at,
      books:book_id (id, title, author_name, cover_url),
      users:user_id (username, display_name, avatar_url)
    `)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (bookId) {
    query = query.eq('book_id', bookId);
  } else {
    query = query.eq('user_id', userId);
  }

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: quotes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hasMore = (quotes?.length ?? 0) > limit;
  const results = hasMore ? quotes!.slice(0, limit) : (quotes ?? []);
  const nextCursor = hasMore ? results[results.length - 1]?.created_at ?? null : null;

  return NextResponse.json({ quotes: results, nextCursor });
}
