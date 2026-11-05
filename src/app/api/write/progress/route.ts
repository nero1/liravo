import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getWritingProgress} from '@/lib/writing-progress';

export const dynamic='force-dynamic';
export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  try{return NextResponse.json(await getWritingProgress(user.id),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'Writing progress unavailable'},{status:503});}
}
