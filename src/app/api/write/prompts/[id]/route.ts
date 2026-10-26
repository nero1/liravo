import { createClient } from '@/lib/supabase/server';
import { writingPromptResponse } from '@/lib/writing-intents';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Invalid prompt' }, { status: 400 });
  const { data, error } = await createClient().from('writing_prompts').select('*').eq('id',params.id).eq('is_active',true).maybeSingle();
  if (error) return NextResponse.json({ error: 'Prompt unavailable' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  return NextResponse.json({ prompt: writingPromptResponse(data) });
}
