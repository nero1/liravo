import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getAuthorQuestionQueue,AuthorQuestionError} from '@/lib/author-questions';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const headers={'Cache-Control':'private, no-store'};
 if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409,headers});
 const query=new URL(request.url).searchParams;
 try{return NextResponse.json(await getAuthorQuestionQueue(user.id,query.get('state')??'all',query.get('cursor')),{headers});}catch(error){return NextResponse.json({error:'Questions unavailable'},{status:error instanceof AuthorQuestionError?error.status:503,headers});}
}
