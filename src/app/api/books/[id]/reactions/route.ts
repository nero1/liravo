import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!z.object({ id: z.string().uuid() }).safeParse(params).success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  const key = request.headers.get('idempotency-key') ?? request.headers.get('x-idempotency-key');
  if (!key || key.length < 8 || key.length > 200) return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  if (!(await checkRouteRateLimit(user.id,'social'))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  const raw=await request.text();if(raw.length>2048)return NextResponse.json({error:'Payload too large'},{status:413});
  let body:unknown={};if(raw)try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=z.object({reviewId:z.string().uuid().optional(),active:z.boolean().optional()}).strict().safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Invalid reaction'},{status:400});
  const { data, error } = await createServiceClient().rpc('apply_book_interaction', {
    p_user_id: user.id, p_book_id: params.id, p_action: 'reaction', p_key: key,p_review_id:parsed.data.reviewId??null,p_value:parsed.data.active??null,
  });
  if (error) {
    const status = error.code === 'P1001' ? 409 : error.code === 'P1003' ? 404 : 503;
    return NextResponse.json({ error: status === 409 ? 'Conflicting idempotency key' : status === 404 ? 'Target unavailable' : 'Interaction unavailable' }, { status });
  }
  return NextResponse.json(data);
}
