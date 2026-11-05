import type {ContentReportRow} from '@/types/database';
export interface ModerationReceipt {actorId:string;reportId:string;report:ContentReportRow;}
export function validModerationReceipt(data:ModerationReceipt,actorId:string,reportId:string){return data?.actorId===actorId&&data.reportId===reportId&&data.report?.id===reportId;}
export async function recoverModerationDecision(actorId:string,reportId:string,key:string):Promise<ModerationReceipt>{
  const response=await fetch('/api/moderation/reports?'+new URLSearchParams({reportId,receipt:key}),{cache:'no-store'}),data=await response.json();
  if(!response.ok||!validModerationReceipt(data,actorId,reportId))throw Error('Decision unavailable');return data;
}
