import { contentIntent, ContentIntentError,getContentCreationReceipt } from '@/lib/content-intents';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {getAuthorQuestions,AuthorQuestionError} from '@/lib/author-questions';
import { sanitizeText } from '@/lib/sanitize';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const submitSchema = z.object({
  author_id: z.string().uuid(),
  question: z.string().min(10).max(500),
});

// GET /api/author/qa?author_id=... — list public answered Q&A for an author
export async function GET(request:Request){
  const query=new URL(request.url).searchParams;
  if(query.has('receipt')){const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});try{const qa=await getContentCreationReceipt(user.id,'author_qa',query.get('receipt')??'');return NextResponse.json({qa,actorId:user.id,authorId:qa.author_id},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Question receipt unavailable'},{status:error instanceof ContentIntentError?error.status:503});}}
  try{return NextResponse.json(await getAuthorQuestions(query.get('author_id')??'',query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Questions unavailable'},{status:error instanceof AuthorQuestionError?error.status:503});}
}

// POST /api/author/qa — fan submits a question
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const question=sanitizeText(parsed.data.question);if(question.length<10||question.length>500)return NextResponse.json({error:'Invalid question'},{status:422});
  const supabase = (await createClient());

  // Confirm the target is actually a verified author
  const { data: authorProfile,error:authorError } = await supabase
    .from('users')
    .select('is_verified_author, user_types, display_name')
    .eq('id', parsed.data.author_id).is('deleted_at',null).eq('is_banned',false)
    .single();
  if(authorError&&authorError.code!=='PGRST116')return NextResponse.json({error:'Author unavailable'},{status:503});

  const isAuthor =
    authorProfile?.is_verified_author ||
    (authorProfile?.user_types ?? []).includes('author');

  if (!isAuthor) return NextResponse.json({ error: 'Target user is not an author' }, { status: 404 });

  let qa;
  try {
    const intent=await contentIntent(req,user.id,'author_qa',{
      author_id: parsed.data.author_id,
      asked_by: user.id,
      question,
      is_public: true,
    });
    qa = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({qa,actorId:user.id,authorId:parsed.data.author_id},{status:201,headers:{'Cache-Control':'private, no-store'}});
}
