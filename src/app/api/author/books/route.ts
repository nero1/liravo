import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getAuthorCatalog} from '@/lib/author-catalog';
import {decodeCursor} from '@/lib/pagination';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const cursor=new URL(request.url).searchParams.get('cursor');try{decodeCursor(cursor);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json({...await getAuthorCatalog(user.id,cursor),actorId:user.id},{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'Author catalog unavailable'},{status:503});}
}
