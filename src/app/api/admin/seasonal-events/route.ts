import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/moderation';
import { applyAdminConfiguration } from '@/lib/admin-configuration';
import { ContentIntentError } from '@/lib/content-intents';

export const dynamic = 'force-dynamic';
const fields={name:z.string().trim().min(1).max(100),theme:z.string().max(500).nullable().default(null),badge_name:z.string().max(100).nullable().default(null),start_date:z.string().datetime(),end_date:z.string().datetime(),is_published:z.boolean().default(false)};
const schema=z.object(fields).strict().refine(value=>Date.parse(value.end_date)>Date.parse(value.start_date));
export async function GET(){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const {data,error}=await createServiceClient().from('seasonal_events').select('id,name,theme,start_date,end_date,badge_name,is_published,created_at').order('start_date',{ascending:false}).limit(100);
  if(error)return NextResponse.json({error:'Events unavailable'},{status:503});
  return NextResponse.json({events:data??[]});
}
async function mutate(request:Request,update:boolean){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const parsed=(update?z.object({...fields,id:z.string().uuid()}).strict().refine(value=>Date.parse(value.end_date)>Date.parse(value.start_date)):schema).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid event dates or fields'},{status:422});
  try{const event=await applyAdminConfiguration(request,guard.userId,update?'season_update':'season_create',parsed.data);return NextResponse.json({event},{status:update?200:201});}
  catch(error){return NextResponse.json({error:'Event update unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
export const POST=(request:Request)=>mutate(request,false);
export const PATCH=(request:Request)=>mutate(request,true);
