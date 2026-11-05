import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {AppealError,getAppeals,getAppealReceipt} from '@/lib/appeals';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const appealSchema = z.object({
  report_id: z.string().uuid().optional(),
  reason: z.string().trim().min(10).max(500),
  content_type: z.enum(['review', 'quote', 'profile', 'debate']).optional(),
  content_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(()=>null);
  const parsed = appealSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  // appeals table may not be in DB type
  let data;
  try {
    const intent=await contentIntent(request,user.id,'appeals',{
      user_id: user.id,
      report_id: parsed.data.report_id ?? null,
      reason: parsed.data.reason,
      content_type: parsed.data.content_type ?? null,
      content_id: parsed.data.content_id ?? null,
      status: 'pending',
    });
    data = await intent.insert();
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Content creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }

  return NextResponse.json({ appeal: data,actorId:user.id }, { status: 201 });
}

export async function GET(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const query=new URL(request.url).searchParams,scope=query.get('scope')??'queue',status=query.get('status')??'pending';if(scope==='receipt'){try{return NextResponse.json(await getAppealReceipt(user.id,query.get('key')??''),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Receipt unavailable'},{status:error instanceof AppealError?error.status:503});}}if(!['mine','queue','actions'].includes(scope)||!['pending','approved','rejected','all'].includes(status))return NextResponse.json({error:'Invalid catalog'},{status:400});
  try{return NextResponse.json(await getAppeals(user.id,scope as 'mine'|'queue'|'actions',status,query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Appeals unavailable'},{status:error instanceof AppealError?error.status:503});}
}
