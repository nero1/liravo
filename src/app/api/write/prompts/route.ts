import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { isAdmin } from '@/lib/moderation';
import { writingPromptResponse } from '@/lib/writing-intents';

export const dynamic = 'force-dynamic';

const CreatePromptSchema = z.object({
  prompt_text: z.string().min(10).max(500),
  theme: z.string().max(100).optional(),
  date: z.iso.date(),
});

export async function GET() {
  const supabase = (await createClient());

  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('writing_prompts')
    .select('*')
    .eq('is_active',true)
    .gte('prompt_date', sevenDaysAgoStr)
    .lte('prompt_date', today)
    .order('prompt_date', { ascending: false }).order('created_at',{ascending:true}).order('id',{ascending:true});

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const prompts = (data ?? []).map(writingPromptResponse);
  const todayPrompt = prompts.find(p => p.date === today) ?? null;
  const pastPrompts = prompts.filter(p => p.date !== today);

  return NextResponse.json({ today: todayPrompt, past: pastPrompts, prompts });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!await isAdmin(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = CreatePromptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { data, error } = await createServiceClient().rpc('publish_writing_prompt', {
    p_date: parsed.data.date, p_text: parsed.data.prompt_text, p_theme: parsed.data.theme ?? null,
  });
  if (error) return NextResponse.json({ error: 'Prompt publication unavailable' }, { status: 503 });
  const result = data as { prompt: Record<string, unknown>; created: boolean };
  return NextResponse.json({ prompt: writingPromptResponse(result.prompt), created: result.created }, { status: result.created ? 201 : 200 });
}
