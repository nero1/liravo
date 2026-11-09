import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/moderation';
import { z } from 'zod';

export const dynamic='force-dynamic';

const schema=z.object({status:z.enum(['approved','rejected']),note:z.string().max(500).optional()});

export async function PATCH(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const auth=await requireModerator();if(auth instanceof NextResponse)return auth;
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==auth.userId)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  try{return NextResponse.json({...(await applyCommunityIntent(request,auth.userId,'appeal_review',params.id,{status:parsed.data.status,note:parsed.data.note??null})),actorId:auth.userId,appealId:params.id});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}
