import {z}from'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { ContentIntentError } from '@/lib/content-intents';
import { getRequestCorrelationId } from '@/lib/utils';
import { checkRouteRateLimit } from '@/lib/rate-limit';

type Action='theme_create'|'theme_set'|'store_create'|'store_update'|'season_create'|'season_update';
export async function applyAdminConfiguration(request:Request,actorId:string,action:Action,payload:Record<string,unknown>){
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');
  if(!key||key.length<8||key.length>200)throw new ContentIntentError('Missing/invalid configuration intent',400);
  if(!await checkRouteRateLimit(actorId,'social'))throw new ContentIntentError('Too many requests',429);
  const {data,error}=await createServiceClient().rpc('apply_admin_configuration',{p_actor_id:actorId,p_action:action,p_key:key,p_payload:z.json().parse(payload),p_correlation_id:getRequestCorrelationId(request)});
  if(error)throw new ContentIntentError('Configuration update unavailable',({P1001:409,P1003:403,P1004:422,P1005:404,23505:409} as Record<string,number>)[error.code]??503);
  if(!data||typeof data!=='object')throw new ContentIntentError('Configuration result unavailable',503);
  return data as Record<string,unknown>;
}
