import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';
import { sanitizeRichText,hasVisibleText } from '@/lib/sanitize';
import {getAuthorAnswerReceipt,AuthorQuestionError,readableAuthorQuestion} from '@/lib/author-questions';

export const dynamic='force-dynamic';

const schema=z.object({qa_id:z.string().uuid(),answer:z.string().min(1).max(2000)});
const headers={'Cache-Control':'private, no-store'};

export async function GET(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409,headers});
 const query=new URL(request.url).searchParams;
 try{return NextResponse.json(await getAuthorAnswerReceipt(user.id,query.get('qa_id')??'',query.get('receipt')??''),{headers});}catch(error){return NextResponse.json({error:'Answer receipt unavailable'},{status:error instanceof AuthorQuestionError?error.status:503,headers});}
}

export async function POST(request:Request) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409,headers});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  const answer=sanitizeRichText(parsed.data.answer);if(!hasVisibleText(answer))return NextResponse.json({error:'Answer required'},{status:422,headers});
  try{const result=await applyCommunityIntent(request,user.id,'author_answer',parsed.data.qa_id,{answer});return NextResponse.json({...result,...result.qa?{qa:readableAuthorQuestion(result.qa as import('@/types/database').AuthorQuestion)}:{}},{headers});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503,headers});
  }
}
