import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getWriterThread,answerCursor} from '@/lib/writer-questions';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid question'},{status:400});
  const cursor=new URL(request.url).searchParams.get('cursor');try{answerCursor(cursor,params.id);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  const user=await getCurrentUser(),actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user?.id)return NextResponse.json({error:'Account changed'},{status:409});
  try{const thread=await getWriterThread(params.id,user?.id??null,cursor);return thread?NextResponse.json(thread,{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'Question not found'},{status:404});}
  catch{return NextResponse.json({error:'Question unavailable'},{status:503});}
}
