import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import type {AppealRow,AppealAction} from '@/types/database';
const position=z.object({actorId:z.string().uuid(),scope:z.string(),at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export class AppealError extends Error{constructor(message:string,public status:number){super(message);}}
export function decodeAppealCursor(value:string|null,actorId:string,scope:string){if(!value)return null;try{if(value.length>700)throw Error();const cursor=position.parse(JSON.parse(Buffer.from(value,'base64url').toString()));if(cursor.actorId!==actorId||cursor.scope!==scope)throw Error();return cursor;}catch{throw new AppealError('Invalid cursor',400);}}
export async function getAppeals(actorId:string,scope:'mine'|'queue'|'actions',status='pending',cursor:string|null=null){
  const key=scope+'.'+(scope==='queue'?status:'all'),before=decodeAppealCursor(cursor,actorId,key),{data,error}=await createServiceClient().rpc('appeal_catalog_snapshot',{p_user:actorId,p_scope:scope,p_status:status,p_at:before?.at??null,p_id:before?.id??null,p_limit:20});
  if(error||!data)throw new AppealError('Appeals unavailable',({P1003:403,P1004:400} as Record<string,number>)[error?.code??'']??503);
  const result=data as {appeals?:AppealRow[];actions?:AppealAction[]},items=scope==='actions'?result.actions!:result.appeals!,rows=items.slice(0,20),last=rows.at(-1),nextCursor=items.length>20&&last?Buffer.from(JSON.stringify({actorId,scope:key,at:last.created_at,id:last.id})).toString('base64url'):null;
  return {actions:scope==='actions'?rows as AppealAction[]:undefined,appeals:scope==='actions'?undefined:rows as AppealRow[],actorId,nextCursor};
}

export async function getAppealReceipt(actorId:string,key:string){
  if(!z.string().min(8).max(200).safeParse(key).success)throw new AppealError('Invalid receipt',400);
  const {data,error}=await createServiceClient().rpc('appeal_receipt_snapshot',{p_user:actorId,p_key:key});
  if(error||!data)throw new AppealError('Receipt unavailable',({P1003:403,P1005:404} as Record<string,number>)[error?.code??'']??503);
  return {appeal:data as AppealRow,actorId};
}
