import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getReadingRoom,decodeRoomCursor,ReadingRoomError} from '@/lib/reading-rooms';
export const dynamic='force-dynamic';
export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid room'},{status:400});
  const cursor=new URL(request.url).searchParams.get('participantsCursor');try{decodeRoomCursor(cursor,user.id,'participants.'+params.id);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json(await getReadingRoom(user.id,params.id,cursor),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:'Room unavailable'},{status:error instanceof ReadingRoomError?error.status:503});}
}
