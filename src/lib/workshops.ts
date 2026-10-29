import {singleRelation} from '@/lib/utils';
import {cursorFilter,encodeCursor,type Cursor} from '@/lib/pagination';
import { createServiceClient } from '@/lib/supabase/server';
import { ContentIntentError } from '@/lib/content-intents';
import { z } from 'zod';

export async function requireWorkshopMember(roomId:string,userId:string) {
  if(!z.string().uuid().safeParse(roomId).success)throw new ContentIntentError('Invalid workshop',400);
  const {data,error}=await createServiceClient().from('workshop_members').select('user_id').eq('room_id',roomId).eq('user_id',userId).maybeSingle();
  if(error)throw new ContentIntentError('Workshop membership unavailable',503);
  if(!data)throw new ContentIntentError('Workshop membership required',403);
}

export async function getWorkshopPage(cursor:Cursor|null=null){
  const query=createServiceClient().from('workshop_rooms').select('id,name,topic,max_members,member_count,facilitator_id,is_active,created_at,facilitator:facilitator_id(display_name,username)').eq('is_active',true).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(31);
  if(cursor)query.or(cursorFilter('created_at',cursor));
  const {data,error}=await query;if(error)throw new Error('Workshops unavailable');
  const rooms=(data??[]).slice(0,30).map(room=>({...room,facilitator:singleRelation(room.facilitator)})),last=rooms.at(-1);
  return {rooms,nextCursor:data?.length===31&&last?encodeCursor({at:last.created_at,id:last.id}):null};
}
