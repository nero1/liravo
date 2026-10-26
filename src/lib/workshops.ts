import { createServiceClient } from '@/lib/supabase/server';
import { ContentIntentError } from '@/lib/content-intents';
import { z } from 'zod';

export async function requireWorkshopMember(roomId:string,userId:string) {
  if(!z.string().uuid().safeParse(roomId).success)throw new ContentIntentError('Invalid workshop',400);
  const {data,error}=await createServiceClient().from('workshop_members').select('user_id').eq('room_id',roomId).eq('user_id',userId).maybeSingle();
  if(error)throw new ContentIntentError('Workshop membership unavailable',503);
  if(!data)throw new ContentIntentError('Workshop membership required',403);
}
