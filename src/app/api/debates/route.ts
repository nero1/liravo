import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextRequest, NextResponse } from 'next/server';
import {getReadingDebates,readingCatalogFailure} from '@/lib/reading-discovery';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CreateDebateSchema = z.object({
  book_id: z.string().uuid(),
  question: z.string().trim().min(5).max(200),
});

export async function GET(request:Request){
  const user=await getCurrentUser(),query=new URL(request.url).searchParams,scope=query.get('scope')??'active';if(!['active','mine'].includes(scope))return NextResponse.json({error:'Invalid catalog'},{status:400});
  try{return NextResponse.json(await getReadingDebates(user?.id??null,scope as 'active'|'mine',query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const result=readingCatalogFailure(error);return NextResponse.json({error:result.error},{status:result.status});}
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateDebateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  let debate;
  try {
    const intent=await contentIntent(request,user.id,'book_debates',{
      book_id: parsed.data.book_id,
      user_id: user.id,
      question: parsed.data.question,
      yes_count: 0,
      no_count: 0,
      is_active: true,
    });
    debate = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ debate,actorId:user.id }, { status: 201 });
}
