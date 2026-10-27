import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/moderation';
import { applyAdminConfiguration } from '@/lib/admin-configuration';
import { ContentIntentError } from '@/lib/content-intents';

export const dynamic = 'force-dynamic';
const storeSchema=z.object({
  name:z.string().trim().min(1).max(100),countries:z.array(z.string().regex(/^[A-Z]{2}$/)).max(100),
  url_template:z.string().max(2000).refine(value=>{
    try{if(/\{(?!isbn\}|tag\}|title\})|[<>\s]/.test(value))return false;const url=new URL(value.replace(/\{(?:isbn|tag|title)\}/g,'example'));return url.protocol==='https:'&&!url.username&&!url.password&&!/[{}]/.test(url.hostname);}catch{return false;}
  }),
  affiliate_tag:z.string().max(200).nullable().default(null),is_active:z.boolean().default(true),priority:z.number().int().min(-99999).max(999999).default(10),is_non_affiliate:z.boolean().default(false),
}).strict();
export async function GET(){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const {data,error}=await createServiceClient().from('affiliate_stores').select('*').order('priority');
  if(error)return NextResponse.json({error:'Stores unavailable'},{status:503});
  return NextResponse.json({stores:data??[]});
}
async function mutate(request:Request,update:boolean){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const parsed=(update?storeSchema.extend({id:z.string().uuid()}):storeSchema).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid store'},{status:422});
  try{const store=await applyAdminConfiguration(request,guard.userId,update?'store_update':'store_create',parsed.data);return NextResponse.json({updated:true,store},{status:update?200:201});}
  catch(error){return NextResponse.json({error:'Store update unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
export const POST=(request:Request)=>mutate(request,false);
export const PATCH=(request:Request)=>mutate(request,true);
