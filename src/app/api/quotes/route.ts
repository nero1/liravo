import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {getReadingQuotes,readingCatalogFailure} from '@/lib/reading-discovery';
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

export async function GET(request:NextRequest){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const query=new URL(request.url).searchParams,owner=query.get('user_id')??user.id,book=query.get('book_id');if(!z.string().uuid().safeParse(owner).success||book&&!z.string().uuid().safeParse(book).success)return NextResponse.json({error:'Invalid filter'},{status:400});
  try{return NextResponse.json(await getReadingQuotes(user.id,owner,book,query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const result=readingCatalogFailure(error);return NextResponse.json({error:result.error},{status:result.status});}
}
