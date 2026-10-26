import { applyCommunityIntent } from '@/lib/community-intents';
import { ContentIntentError } from '@/lib/content-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModerator } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const patchSchema = z.object({
  status: z.enum(['pending', 'approved', 'removed', 'warned', 'escalated']).optional(),
  moderator_note: z.string().max(1000).optional(),
});

export async function GET(request: Request) {
  const auth = await requireModerator();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  const supabase = createServiceClient();

  const { data: reports, error, count } = await supabase
    .from('content_reports')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reports: reports ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
}

export async function PATCH(request:Request) {
  const auth=await requireModerator();if(auth instanceof NextResponse)return auth;
  const reportId=new URL(request.url).searchParams.get('reportId');if(!reportId)return NextResponse.json({error:'reportId required'},{status:400});
  let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=patchSchema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid decision'},{status:400});
  try{return NextResponse.json(await applyCommunityIntent(request,auth.userId,'report_review',reportId,{status:parsed.data.status??null,note:parsed.data.moderator_note??null}));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});
  }
}
