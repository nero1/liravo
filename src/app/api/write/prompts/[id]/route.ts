import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';
import { writingPromptResponse } from '@/lib/writing-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Invalid prompt' }, { status: 400 });
  const { data, error } = await (await createClient()).from('writing_prompts').select('*').eq('id',params.id).eq('is_active',true).maybeSingle();
  if (error) return NextResponse.json({ error: 'Prompt unavailable' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  const user=await getCurrentUser();
  const submission=user?await (await createClient()).from('writing_prompt_submissions').select('id,user_id,content,word_count').eq('prompt_id',params.id).eq('user_id',user.id).maybeSingle():null;
  if(submission?.error)return NextResponse.json({error:'Response unavailable'},{status:503});
  return NextResponse.json({actorId:user?.id??null,prompt:writingPromptResponse(data),submission:submission?.data??null},{headers:{'Cache-Control':'private, no-store'}});
}
