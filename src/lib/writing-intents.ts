import { createServiceClient } from '@/lib/supabase/server';
import { ContentIntentError } from '@/lib/content-intents';
import { z } from 'zod';

type WritingAction = 'prompt' | 'challenge' | 'join' | 'vote' | 'best_answer';

export async function applyWritingIntent(request: Request, userId: string, action: WritingAction, target: string, payload: Record<string, unknown>) {
  const key = request.headers.get('idempotency-key');
  if (!key || key.length < 8 || key.length > 200) throw new ContentIntentError('Missing/invalid idempotency key',400);
  if (!z.string().uuid().safeParse(target).success) throw new ContentIntentError('Invalid writing target',400);
  const { data, error } = await createServiceClient().rpc('apply_writing_intent' as never, {
    p_user_id: userId, p_kind: action, p_target: target, p_key: key, p_payload: payload,
  } as never);
  if (error) {
    const status = ({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code] ?? 503;
    throw new ContentIntentError(status === 503 ? 'Writing service unavailable' : error.message,status);
  }
  if (!data || typeof data !== 'object') throw new ContentIntentError('Writing result unavailable',503);
  return data as Record<string, unknown>;
}

export function writingPromptResponse(row: Record<string, unknown>) {
  const date = row.prompt_date instanceof Date ? row.prompt_date.toISOString().slice(0,10) : typeof row.prompt_date === 'string' ? row.prompt_date.slice(0,10) : null;
  return { ...row, prompt_date: date, date, theme: row.topic_seed, prompt: row.prompt_text, genre: row.topic_seed };
}

export function writingChallengeResponse(row: Record<string, unknown>) {
  return { ...row, name: row.title, challenge_type: row.type, xp_reward: 25, deadline: row.end_date };
}
