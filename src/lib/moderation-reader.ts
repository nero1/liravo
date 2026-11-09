import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {sanitizeExcerpt} from '@/lib/sanitize';
import type {ModerationReport,ModerationLog,ModerationPage,ContentReportRow} from '@/types/database';
export const reportStatuses=['pending','escalated','approved','removed','warned','all'] as const;
export class ModerationReadError extends Error{constructor(message:string,public status:number){super(message);}}
const cursorSchema=z.object({actorId:z.string().uuid(),scope:z.enum(['reports','log']),status:z.enum(reportStatuses),at:z.string().datetime({offset:true}),key:z.string().uuid()}).strict();
export async function readModeration<T extends ModerationReport|ModerationLog>(actorId:string,scope:'reports'|'log',{status='pending',cursor:raw=null,page=1}:{status?:string;cursor?:string|null;page?:number}={}):Promise<ModerationPage<T>>{
  if(!reportStatuses.includes(status as never)||!Number.isInteger(page)||page<1||page>10001||raw!==null&&typeof raw!=='string'||raw&&raw.length>2000||raw&&page!==1)throw new ModerationReadError('Invalid moderation page',400);
  let cursor:z.infer<typeof cursorSchema>|null=null;
  if(raw)try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString()));if(cursor.actorId!==actorId||cursor.scope!==scope||cursor.status!==status)throw Error();}catch{throw new ModerationReadError('Invalid moderation cursor',400);}
  const data=await snapshot(actorId,scope,{p_status:status,p_at:cursor?.at??null,p_id:cursor?.key??null,p_limit:20,p_offset:(page-1)*20}) as {total:number;rows:{item:T;at:string;key:string}[]};
  const rows=data.rows.slice(0,20),last=rows.at(-1),items=rows.map(({item})=>{if('target'in item&&item.target&&'content'in item.target)item.target.content=sanitizeExcerpt(item.target.content??'');return item;});
  return {items,total:data.total,actorId,page,pageSize:20,nextCursor:data.rows.length>20&&last?Buffer.from(JSON.stringify({actorId,scope,status,at:last.at,key:last.key})).toString('base64url'):null};
}
async function snapshot(actorId:string,scope:string,params:Record<string,unknown>={}){
  const{data,error}=await createServiceClient().rpc('moderation_catalog_snapshot',{p_user:actorId,p_scope:scope,...params});
  if(error||!data)throw new ModerationReadError('Moderation unavailable',error?.code==='P1003'?403:503);return data;
}
export async function readModerationDashboard(actorId:string){return await snapshot(actorId,'dashboard')as{isAdmin:boolean;pending:number;today:number};}
export async function readModerationReceipt(actorId:string,reportId:string,key:string){
  if(!z.string().uuid().safeParse(reportId).success||key.length<8||key.length>200)throw new ModerationReadError('Invalid receipt',400);
  const{data,error}=await createServiceClient().rpc('moderation_receipt_snapshot',{p_user:actorId,p_report:reportId,p_key:key});
  if(error||!data)throw new ModerationReadError('Receipt unavailable',error?.code==='P1003'?403:error?.code==='P1005'?404:503);
  const report=(data as {report:ContentReportRow}).report;
  if(report?.id!==reportId)throw new ModerationReadError('Receipt unavailable',503);
  return {actorId,reportId,report};
}
