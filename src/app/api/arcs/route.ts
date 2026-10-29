import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getArcs,decodeArcCursor} from '@/lib/arcs';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const url=new URL(request.url),cursor=url.searchParams.get('cursor'),authorId=url.searchParams.get('authorId');
  if(authorId&&!z.string().uuid().safeParse(authorId).success)return NextResponse.json({error:'Invalid author'},{status:400});
  try{decodeArcCursor(cursor,user.id,false,authorId);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json({...await getArcs(user.id,false,cursor,authorId),actorId:user.id},{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'ARCs unavailable'},{status:503});}
}
