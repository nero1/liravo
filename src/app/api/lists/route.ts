import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import {getReadingLists,listError} from '@/lib/reading-lists';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const CreateListSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  is_public: z.boolean().default(true),
});

export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const query=new URL(request.url).searchParams,scope=query.get('scope');if(scope&&!['mine','followed'].includes(scope))return NextResponse.json({error:'Invalid scope'},{status:400});
  try{
    if(scope)return NextResponse.json(await getReadingLists(user.id,scope as 'mine'|'followed',query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});
    const [own,followed]=await Promise.all([getReadingLists(user.id,'mine',query.get('cursor')),getReadingLists(user.id,'followed',query.get('followedCursor'))]);
    return NextResponse.json({...own,followedLists:followed.lists,nextFollowedCursor:followed.nextCursor},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){const result=listError(error);return NextResponse.json({error:result.error},{status:result.status});}
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  let list;
  try {
    const intent=await contentIntent(request,user.id,'reading_lists',{
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_public: parsed.data.is_public,
    });
    list = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ list,actorId:user.id }, { status: 201 });
}
