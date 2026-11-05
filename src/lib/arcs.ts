import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import type {ArcOffer,ArcApplications} from '@/types/database';
export type {ArcOffer,ArcApplication,ArcApplications} from '@/types/database';
export class ArcError extends Error{constructor(message:string,public status:number){super(message);}}
export const applicationStatus=z.enum(['all','pending','approved','rejected']);
export type ApplicationStatus=z.infer<typeof applicationStatus>;
const position=z.object({at:z.string().datetime({offset:true}),id:z.string().uuid()});
const catalogCursor=position.extend({viewerId:z.string().uuid().nullable(),owned:z.boolean(),authorId:z.string().uuid().nullable()}).strict();
const applicationCursor=position.extend({arcId:z.string().uuid(),status:applicationStatus}).strict();
function read(value:string|null){if(!value)return null;if(value.length>700)throw Error('Invalid cursor');return JSON.parse(Buffer.from(value,'base64url').toString());}
export function decodeArcCursor(value:string|null,viewerId:string|null,owned:boolean,authorId:string|null=null){const raw=read(value);if(!raw)return null;const cursor=catalogCursor.parse(raw);if(cursor.viewerId!==viewerId||cursor.owned!==owned||cursor.authorId!==authorId)throw Error('Invalid cursor');return cursor;}
export function decodeApplicationCursor(value:string|null,arcId:string,status:ApplicationStatus){const raw=read(value);if(!raw)return null;const cursor=applicationCursor.parse(raw);if(cursor.arcId!==arcId||cursor.status!==status)throw Error('Invalid cursor');return cursor;}
export async function getArcs(viewerId:string|null,owned=false,cursor:string|null=null,authorId:string|null=null){
  const before=decodeArcCursor(cursor,viewerId,owned,authorId),limit=20,{data,error}=await createServiceClient().rpc('arc_catalog_snapshot' as never,{p_user:viewerId,p_owned:owned,p_before:before?.at??null,p_id:before?.id??null,p_author:authorId,p_limit:limit} as never);
  if(error||!data)throw new ArcError('ARCs unavailable',503);const source=(data as {arcs:ArcOffer[]}).arcs,arcs=source.slice(0,limit),last=arcs.at(-1);
  return {arcs,nextCursor:source.length>limit&&last?Buffer.from(JSON.stringify({viewerId,owned,authorId,at:last.created_at,id:last.id})).toString('base64url'):null};
}
export async function getArcApplications(viewerId:string,arcId:string,status:ApplicationStatus='all',cursor:string|null=null):Promise<ArcApplications|null>{
  const before=decodeApplicationCursor(cursor,arcId,status),limit=20,{data,error}=await createServiceClient().rpc('arc_application_snapshot' as never,{p_user:viewerId,p_arc:arcId,p_status:status,p_before:before?.at??null,p_id:before?.id??null,p_limit:limit} as never);
  if(error)throw new ArcError('ARC applications unavailable',error.code==='P1003'?403:503);if(!data)return null;
  const snapshot=data as ArcApplications,applications=snapshot.applications.slice(0,limit),last=applications.at(-1);
  return {...snapshot,applications,nextCursor:snapshot.applications.length>limit&&last?Buffer.from(JSON.stringify({arcId,status,at:last.applied_at,id:last.id})).toString('base64url'):null,actorId:viewerId};
}
