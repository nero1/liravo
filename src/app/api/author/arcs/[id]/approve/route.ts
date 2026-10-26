import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export const dynamic='force-dynamic';

const schema=z.object({applicationId:z.string().uuid(),approved:z.boolean()});

export async function POST(request:Request,{params}:{params:{id:string}}) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  try{return NextResponse.json(await applyCommunityIntent(request,user.id,'arc_review',params.id,parsed.data));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}
