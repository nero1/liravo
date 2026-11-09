import {authorPostPage} from '@/lib/content-history';
import {decodeCursor} from '@/lib/pagination';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeText, sanitizeRichText } from '@/lib/sanitize';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  book_id: z.string().uuid().optional(),
  type: z.enum(['announcement', 'blog', 'arc_invite']),
}).refine(value=>value.type!=='arc_invite'||!!value.book_id,{message:'ARC invites require an approved book'});

export async function GET(req:Request){
 const query=new URL(req.url).searchParams,author=query.get('authorId'),cursor=query.get('cursor');
 try{if(!z.string().uuid().safeParse(author).success)throw Error();decodeCursor(cursor);}catch{return NextResponse.json({error:'Invalid history query'},{status:400});}
 const viewer=await getCurrentUser();
 try{return NextResponse.json({authorId:author,...await authorPostPage(author!,viewer?.id??null,cursor)},{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Posts unavailable'},{status:503});}
}

export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('is_verified_author, user_types, display_name, username')
    .eq('id', user.id)
    .single();

  const isAuthor =
    profile?.is_verified_author ||
    (profile?.user_types ?? []).includes('author');

  if (!isAuthor) {
    return NextResponse.json({ error: 'Author access required' }, { status: 403 });
  }

  const body = await req.json().catch(()=>null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let post;
  try {
    const intent=await contentIntent(req,user.id,'author_posts',{
      author_id: user.id,
      title: sanitizeText(parsed.data.title),
      body: sanitizeRichText(parsed.data.body),
      book_id: parsed.data.book_id ?? null,
      type: parsed.data.type,
    });
    post = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ post }, { status: 201 });
}
