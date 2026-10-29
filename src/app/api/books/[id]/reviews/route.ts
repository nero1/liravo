import {getBookReviews,ReviewCursorError} from '@/services/book-reviews';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import { classifyTone } from '@/lib/tone-classifier';
import { checkSpam } from '@/lib/spam-detection';
import { sanitizeText, sanitizeRichText,hasVisibleText } from '@/lib/sanitize';
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

export async function GET(request:Request,{params}:{params:{id:string}}){
  if(!await getCurrentUser())return NextResponse.json({error:'Unauthorized'},{status:401});
  const query=new URL(request.url).searchParams;
  try{
    const page=await getBookReviews(params.id,query.get('cursor'),Number(query.get('limit')??50));
    return page?NextResponse.json(page,{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'Book not found'},{status:404});
  }catch(error){return NextResponse.json({error:error instanceof ReviewCursorError?'Invalid review page':'Reviews unavailable'},{status:error instanceof ReviewCursorError?400:503});}
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid book'},{status:400});
  const raw = await request.json().catch(()=>null);
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { star_rating, review_type, mood_tags, spoiler_warning } = parsed.data;
  // Sanitize before any further processing or storage
  const body = review_type === 'long' ? sanitizeRichText(parsed.data.body) : sanitizeText(parsed.data.body);
  if(!hasVisibleText(body))return NextResponse.json({error:'Review text is required'},{status:400});

  let review;
  try {
    const intent = await contentIntent(request, user.id, 'reviews', {
      book_id: params.id, rating: star_rating, content: body, review_type, mood_tags,
      has_spoilers: spoiler_warning, read_date: parsed.data.read_date ?? null,
      edition_read: parsed.data.edition_read ?? null, moderation_status: 'published',
    });
    if (!intent.existing) {
      if (await checkSpam(user.id, 'review')) return NextResponse.json({ error: 'Too many submissions. Please wait before posting again.' }, { status: 429 });
      if (await classifyTone(body) === 'toxic') return NextResponse.json({ error: 'Review contains inappropriate content. Please revise.' }, { status: 400 });
    }
    review = await intent.insert();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Review unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }

  // Award XP for writing a review
  await awardXP(user.id, XP_CONFIG.SHORT_REVIEW, 'write_review', `review:${params.id}`);

  // Invalidate taste profile cache so next request regenerates with fresh data
  try {
    const redis = getRedisClient();
    await redis.del(`taste_profile:${user.id}`);
  } catch {
    // Non-critical
  }

  return NextResponse.json({ review }, { status: 201 });
}
