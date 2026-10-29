import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import {getWorkshopPage} from '@/lib/workshops';
import {decodeCursor} from '@/lib/pagination';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CreateRoomSchema = z.object({
  name: z.string().min(3).max(100).refine(value=>value.trim().length>=3),
  topic: z.string().max(200).optional(),
  max_members: z.number().int().min(3).max(8),
}).strict();

export async function GET(request:Request){
  if(!await getCurrentUser())return NextResponse.json({error:'Unauthorized'},{status:401});
  let cursor;try{cursor=decodeCursor(new URL(request.url).searchParams.get('cursor'));}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{return NextResponse.json(await getWorkshopPage(cursor),{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Workshops unavailable'},{status:503});}
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  let data;
  try {
    const intent=await contentIntent(req,user.id,'workshop_rooms',{
      ...parsed.data,
      facilitator_id: user.id,
      is_active: true,
    });
    data = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ room: data }, { status: 201 });
}
