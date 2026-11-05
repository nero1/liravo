import {awardXP} from '@/services/xp';
import {contentIntent,ContentIntentError} from '@/lib/content-intents';
import {getWriterQuestions,questionFilter,questionListCursor} from '@/lib/writer-questions';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {NextResponse} from 'next/server';
import {z} from 'zod';
export const dynamic='force-dynamic';
const schema=z.object({question:z.string().trim().min(10).max(280),tags:z.array(z.string().trim().min(1).max(50)).max(5).optional().transform(value=>[...new Set(value??[])])}).strict();
export async function GET(request:Request){
  const url=new URL(request.url),filter=questionFilter.safeParse(url.searchParams.get('filter')??'all'),cursor=url.searchParams.get('cursor');
  if(!filter.success||(url.searchParams.has('page')&&url.searchParams.get('page')!=='1'))return NextResponse.json({error:'Invalid pagination or filter; use a cursor'},{status:400});
  try{questionListCursor(cursor,filter.data);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  const user=await getCurrentUser(),actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user?.id)return NextResponse.json({error:'Account changed'},{status:409});
  try{return NextResponse.json({...await getWriterQuestions(filter.data,cursor),actorId:user?.id??null},{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'Writer questions unavailable'},{status:503});}
}
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid question'},{status:422});
  try{const intent=await contentIntent(request,user.id,'ask_writer_questions',{question:parsed.data.question,tags:parsed.data.tags,answer_count:0}),question=await intent.insert();await awardXP(user.id,5,'ask_question',`question:${question.id}`);return NextResponse.json({question,actorId:user.id},{status:201,headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Question unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
