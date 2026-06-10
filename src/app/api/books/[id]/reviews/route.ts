import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import { classifyTone } from '@/lib/tone-classifier';
import { checkSpam } from '@/lib/spam-detection';
import { sanitizeText, sanitizeRichText } from '@/lib/sanitize';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRedisClient } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  star_rating: z.number().int().min(1).max(5),
  body: z.string().min(1).max(2000),
  review_type: z.enum(['short', 'long', 'one_line']),
  mood_tags: z.array(z.string()).default([]),
  spoiler_warning: z.boolean().default(false),
  read_date: z.string().date().optional(),
  edition_read: z.string().max(100).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select(`
      id, rating, content, review_type, mood_tags, has_spoilers,
      likes_count, created_at, moderation_status,
      users:user_id (display_name, avatar_url, username)
    `)
    .eq('book_id', params.id)
    .eq('moderation_status', 'published')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reviews: reviews ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { star_rating, review_type, mood_tags, spoiler_warning } = parsed.data;
  // Sanitize before any further processing or storage
  const body = review_type === 'long' ? sanitizeRichText(parsed.data.body) : sanitizeText(parsed.data.body);

  // Check for spam before proceeding
  const isSpam = await checkSpam(user.id, 'review');
  if (isSpam) {
    return NextResponse.json({ error: 'Too many submissions. Please wait before posting again.' }, { status: 429 });
  }

  // Classify tone; block toxic content
  const tone = await classifyTone(body);
  if (tone === 'toxic') {
    return NextResponse.json({ error: 'Review contains inappropriate content. Please revise.' }, { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  const { data: review, error } = await serviceSupabase
    .from('reviews')
    .insert({
      user_id: user.id,
      book_id: params.id,
      rating: star_rating,
      content: body,
      review_type,
      mood_tags,
      has_spoilers: spoiler_warning,
      read_date: parsed.data.read_date ?? null,
      edition_read: parsed.data.edition_read ?? null,
      moderation_status: 'published',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Award XP for writing a review
  await awardXP(user.id, XP_CONFIG.SHORT_REVIEW, 'write_review');

  // Invalidate taste profile cache so next request regenerates with fresh data
  try {
    const redis = getRedisClient();
    await redis.del(`taste_profile:${user.id}`);
  } catch {
    // Non-critical
  }

  // Upsert book_community_stats if table exists — best effort
  try {
    const { data: existing } = await serviceSupabase
      .from('reviews')
      .select('rating')
      .eq('book_id', params.id)
      .eq('moderation_status', 'published');

    if (existing && existing.length > 0) {
      const avg = existing.reduce((sum, r) => sum + r.rating, 0) / existing.length;
      await serviceSupabase
        .from('books')
        .update({
          average_rating: Math.round(avg * 10) / 10,
          ratings_count: existing.length,
        })
        .eq('id', params.id);
    }
  } catch {
    // Non-critical — ignore errors
  }

  return NextResponse.json({ review }, { status: 201 });
}
