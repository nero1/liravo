import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/moderation';
import { z } from 'zod';

export const dynamic='force-dynamic';

const schema=z.object({action:z.enum(['approve','remove','warn','escalate']),reason:z.string().max(1000).optional()});

export async function POST(request:Request,{params}:{params:{id:string}}) {
  const auth=await requireModerator();if(auth instanceof NextResponse)return auth;
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  const status={approve:'approved',remove:'removed',warn:'warned',escalate:'escalated'}[parsed.data.action];
  try{
    await applyCommunityIntent(request,auth.userId,'report_review',params.id,{status,note:parsed.data.reason??null});
    return NextResponse.json({ok:true,action:parsed.data.action,reportId:params.id});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}
