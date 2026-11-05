import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/moderation';
import {readModeration,ModerationReadError} from '@/lib/moderation-reader';
import type {ModerationLog} from '@/types/database';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const auth=await requireAdmin();if(auth instanceof NextResponse)return auth;
  const query=new URL(request.url).searchParams;
  try{const{items,...metadata}=await readModeration<ModerationLog>(auth.userId,'log',{cursor:query.get('cursor'),page:Number(query.get('page')??'1')});return NextResponse.json({logs:items,...metadata},{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:'Log unavailable'},{status:error instanceof ModerationReadError?error.status:503});}
}
