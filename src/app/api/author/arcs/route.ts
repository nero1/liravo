import {getArcs,decodeArcCursor} from '@/lib/arcs';
import {getAuthorCatalog} from '@/lib/author-catalog';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const arcSchema = z.object({
  book_id: z.string().uuid(),
  description: z.string().trim().min(1).max(1000),
  reader_slots: z.number().int().min(1).max(20),
  close_date: z.string().datetime().refine(value=>new Date(value).getTime()>Date.now()).optional(),
});

export async function GET(req: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requestedAuthor=searchParams.get('authorId');
  if(requestedAuthor&&requestedAuthor!=='me'&&requestedAuthor!==user.id)return NextResponse.json({error:'Forbidden'},{status:403});

  const cursor=searchParams.get('cursor');try{decodeArcCursor(cursor,user.id,true);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{const [catalog,offers]=await Promise.all([getAuthorCatalog(user.id),getArcs(user.id,true,cursor)]);
    return NextResponse.json({...offers,books:catalog.books,booksNextCursor:catalog.nextCursor,actorId:user.id},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Author ARCs unavailable'},{status:503});}
}

export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile,error:profileError } = await supabase
    .from('users')
    .select('is_verified_author, user_types')
    .eq('id', user.id)
    .single();

  if(profileError)return NextResponse.json({error:'Author profile unavailable'},{status:503});
  const isAuthor =
    profile?.is_verified_author ||
    (profile?.user_types ?? []).includes('author');

  if (!isAuthor) {
    return NextResponse.json({ error: 'Author access required' }, { status: 403 });
  }

  const body = await req.json().catch(()=>null);
  const parsed = arcSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let data;
  try {
    const intent=await contentIntent(req,user.id,'arcs',{
      author_id: user.id,
      book_id: parsed.data.book_id,
      description: parsed.data.description,
      reader_slots: parsed.data.reader_slots,
      close_date: parsed.data.close_date ?? null,
      is_active: true,
    });
    data = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ arc: data }, { status: 201 });
}
