import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { z } from 'zod';

export const dynamic='force-dynamic';

const schema=z.object({nominee_id:z.string().uuid(),note:z.string().max(500).optional()});

export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid chain'},{status:400});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
  try{return NextResponse.json(await applyCommunityIntent(request,user.id,'chain_nominate',params.id,{nominee_id:parsed.data.nominee_id,note:parsed.data.note??null}),{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}
