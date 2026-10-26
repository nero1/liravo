import { createServiceClient } from '@/lib/supabase/server';
import { ContentIntentError } from '@/lib/content-intents';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { getRequestCorrelationId } from '@/lib/utils';

type CommunityAction='author_answer'|'arc_apply'|'arc_review'|'author_verify'|'appeal_review'|'community_note_review'|'report_review'|'admin_user'|'chain_create'|'chain_nominate';

export async function applyCommunityIntent(request:Request,actorId:string,action:CommunityAction,target:string,payload:Record<string,unknown>) {
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');
  if(!key||key.length<8||key.length>200||!z.string().uuid().safeParse(target).success)throw new ContentIntentError('Invalid community intent',400);
  if(!await checkRouteRateLimit(actorId,'social'))throw new ContentIntentError('Too many requests',429);
  const {data,error}=await createServiceClient().rpc('apply_community_intent' as never,{p_actor_id:actorId,p_action:action,p_target:target,p_key:key,p_payload:payload,p_correlation_id:getRequestCorrelationId(request)} as never);
  if(error){
    const status=({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503;
    throw new ContentIntentError(status===503?'Community service unavailable':error.message,status);
  }
  if(!data||typeof data!=='object')throw new ContentIntentError('Community result unavailable',503);
  return data as Record<string,unknown>;
}
