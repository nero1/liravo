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
import {createServiceClient} from '@/lib/supabase/server';
import {requestJson,BodyError} from '@/lib/request-body';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  star_rating: z.number().int().min(1).max(5),
  body: z.string().min(1).max(2000),
  review_type: z.enum(['short', 'long', 'one_line']),
  mood_tags: z.array(z.string().max(40)).max(20).default([]),
  spoiler_warning: z.boolean().default(false),
  read_date: z.string().date().optional(),
  edition_read: z.string().max(100).optional(),
});

export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  if(!(await getCurrentUser()))return NextResponse.json({error:'Unauthorized'},{status:401});
  const query=new URL(request.url).searchParams;
  try{
    const page=await getBookReviews(params.id,query.get('cursor'),Number(query.get('limit')??50));
    return page?NextResponse.json(page,{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'Book not found'},{status:404});
  }catch(error){return NextResponse.json({error:error instanceof ReviewCursorError?'Invalid review page':'Reviews unavailable'},{status:error instanceof ReviewCursorError?400:503});}
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid book'},{status:400});
  let raw;try{raw=await requestJson(request,16384);}catch(error){return NextResponse.json({error:'Invalid review body'},{status:error instanceof BodyError?error.status:400});}
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { star_rating, review_type, mood_tags, spoiler_warning } = parsed.data;
  // Sanitize before any further processing or storage
  const body = review_type === 'long' ? sanitizeRichText(parsed.data.body) : sanitizeText(parsed.data.body);
  if(!hasVisibleText(body))return NextResponse.json({error:'Review text is required'},{status:400});

  let review;let tone:Awaited<ReturnType<typeof classifyTone>>|null=null;
  try {
    const intent = await contentIntent(request, user.id, 'reviews', {
      book_id: params.id, rating: star_rating, content: body, review_type, mood_tags,
      has_spoilers: spoiler_warning, read_date: parsed.data.read_date ?? null,
      edition_read: parsed.data.edition_read ?? null, moderation_status: 'pending',
    });
    if (!intent.existing) {
      if (await checkSpam(user.id, 'review')) return NextResponse.json({ error: 'Too many submissions. Please wait before posting again.' }, { status: 429 });
      tone=await classifyTone(body);
      if (tone === 'toxic') return NextResponse.json({ error: 'Review contains inappropriate content. Please revise.' }, { status: 400 });
    }
    review = await intent.insert();
    if(!intent.existing&&tone&&tone!=='unavailable'){
      const {data,error}=await createServiceClient().rpc('finish_review_moderation',{p_review:review.id,p_status:'published',p_owner:user.id});
      if(error||!data||(data as {reviewId?:string}).reviewId!==review.id||!['pending','published','removed'].includes((data as {status:string}).status))throw new Error('Review publication unavailable');
      review={...review,moderation_status:(data as {status:string}).status};
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Review unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }

  if(review.moderation_status==='pending'||review.moderation_status==='removed')return NextResponse.json({review},{status:202,headers:{'Cache-Control':'private, no-store'}});

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
