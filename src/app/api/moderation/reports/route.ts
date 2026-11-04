import {applyCommunityIntent} from '@/lib/community-intents';
import {ContentIntentError} from '@/lib/content-intents';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireModerator} from '@/lib/moderation';
import {readModeration,readModerationReceipt,ModerationReadError} from '@/lib/moderation-reader';
import type {ModerationReport} from '@/types/database';
export const dynamic='force-dynamic';
const patchSchema=z.object({status:z.enum(['pending','approved','removed','warned','escalated']).optional(),moderator_note:z.string().max(1000).optional()}).refine(value=>value.status!==undefined||value.moderator_note!==undefined);
export async function GET(request:Request){
  const auth=await requireModerator();if(auth instanceof NextResponse)return auth;
  const query=new URL(request.url).searchParams;
  try{
    if(query.has('receipt'))return NextResponse.json(await readModerationReceipt(auth.userId,query.get('reportId')??'',query.get('receipt')??''),{headers:{'Cache-Control':'private, no-store'}});
    const{items,...metadata}=await readModeration<ModerationReport>(auth.userId,'reports',{status:query.get('status')??'pending',cursor:query.get('cursor'),page:Number(query.get('page')??'1')});
    return NextResponse.json({reports:items,...metadata},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:'Reports unavailable'},{status:error instanceof ModerationReadError?error.status:503});}
}
export async function PATCH(request:Request){
  const auth=await requireModerator();if(auth instanceof NextResponse)return auth;
  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==auth.userId)return NextResponse.json({error:'Account changed'},{status:409});
  const reportId=new URL(request.url).searchParams.get('reportId');if(!z.string().uuid().safeParse(reportId).success)return NextResponse.json({error:'Invalid report'},{status:400});
  const parsed=patchSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid decision'},{status:400});
  try{const result=await applyCommunityIntent(request,auth.userId,'report_review',reportId!,{status:parsed.data.status??null,note:parsed.data.moderator_note??null});return NextResponse.json({...result,actorId:auth.userId,reportId},{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Community service unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
