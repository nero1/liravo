import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import type {BuddyReadRow,BuddyReadDetail,BuddyNote} from '@/types/database';
const cursorSchema=z.object({actorId:z.string().uuid(),scope:z.string(),at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export function decodeBuddyCursor(value:string|null,actorId:string,scope:string){
  if(!value)return null;if(value.length>700)throw Error('Invalid cursor');
  const cursor=cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString()));
  if(cursor.actorId!==actorId||cursor.scope!==scope)throw Error('Invalid cursor');return cursor;
}
function page<T extends {id:string;created_at:string}>(rows:T[],actorId:string,scope:string){
  const items=rows.slice(0,20),last=items.at(-1);
  return {items,nextCursor:rows.length>20&&last?Buffer.from(JSON.stringify({actorId,scope,at:last.created_at,id:last.id})).toString('base64url'):null};
}
export async function getBuddyReads(actorId:string,scope:'mine'|'open',cursor:string|null=null){
  const before=decodeBuddyCursor(cursor,actorId,scope),{data,error}=await createServiceClient().rpc('buddy_catalog_snapshot' as never,{p_user:actorId,p_scope:scope,p_before:before?.at??null,p_id:before?.id??null,p_limit:20} as never);
  if(error||!data)throw Error('Buddy reads unavailable');
  const result=page((data as {buddy_reads:BuddyReadRow[]}).buddy_reads,actorId,scope);
  return {buddy_reads:result.items,nextCursor:result.nextCursor,actorId};
}
export async function getBuddyDetail(actorId:string,roomId:string):Promise<BuddyReadDetail|null>{
  const {data,error}=await createServiceClient().rpc('buddy_detail_snapshot' as never,{p_user:actorId,p_room:roomId} as never);
  if(error)throw Error('Buddy read unavailable');return data?{...data as Omit<BuddyReadDetail,'actorId'>,actorId}:null;
}
export async function getBuddyNotes(actorId:string,roomId:string,cursor:string|null=null){
  const scope='notes.'+roomId,before=decodeBuddyCursor(cursor,actorId,scope),{data,error}=await createServiceClient().rpc('buddy_notes_snapshot' as never,{p_user:actorId,p_room:roomId,p_before:before?.at??null,p_id:before?.id??null,p_limit:20} as never);
  if(error||!data)throw Object.assign(Error('Notes unavailable'),{status:error?.code==='P1003'?403:503});
  const result=page((data as {notes:BuddyNote[]}).notes,actorId,scope);
  return {notes:result.items,nextCursor:result.nextCursor,actorId,roomId};
}
