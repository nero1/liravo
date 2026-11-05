import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import {getReadingRooms,decodeRoomCursor,ReadingRoomError} from '@/lib/reading-rooms';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  book_id: z.string().uuid().optional(),
  is_public: z.boolean().default(true),
});

export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const params=new URL(request.url).searchParams,scope=params.get('scope')??'public',cursor=params.get('cursor');
  if(scope!=='public'&&scope!=='mine')return NextResponse.json({error:'Invalid catalog'},{status:400});
  try{decodeRoomCursor(cursor,user.id,scope);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json(await getReadingRooms(user.id,scope,cursor),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:'Rooms unavailable'},{status:error instanceof ReadingRoomError?error.status:503});}
}

export async function POST(req: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(()=>null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let room;
  try {
    const intent=await contentIntent(req,user.id,'reading_rooms',{
      name: parsed.data.name,
      book_id: parsed.data.book_id ?? null,
      is_public: parsed.data.is_public,
      created_by: user.id,
      is_active: true,
    });
    room = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ room,actorId:user.id }, { status: 201 });
}
