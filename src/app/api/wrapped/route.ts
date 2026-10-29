import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingYear} from '@/lib/reading-statistics';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  try{const snapshot=await getReadingYear(user.id);return snapshot?NextResponse.json({...snapshot.wrapped,actorId:user.id},{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'Account unavailable'},{status:404});}
  catch{return NextResponse.json({error:'Reading summary unavailable'},{status:503});}
}
