import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/moderation';
import { z } from 'zod';

export const dynamic='force-dynamic';

const schema=z.object({userId:z.string().uuid(),approved:z.boolean()});

export async function POST(request:Request) {
  const auth=await requireAdmin();if(auth instanceof NextResponse)return auth;
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==auth.userId)return NextResponse.json({error:'Account changed'},{status:409});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  try{return NextResponse.json(await applyCommunityIntent(request,auth.userId,'author_verify',parsed.data.userId,{approved:parsed.data.approved}));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}
