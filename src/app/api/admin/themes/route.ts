import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/moderation';
import { normalizeThemeCss } from '@/lib/theme-css';
import { applyAdminConfiguration } from '@/lib/admin-configuration';
import { ContentIntentError } from '@/lib/content-intents';

export const dynamic = 'force-dynamic';
const name=z.string().trim().min(1).max(80);
export async function GET(){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const {data,error}=await createServiceClient().from('custom_themes').select('name,css_overrides,is_active').order('created_at',{ascending:false});
  if(error)return NextResponse.json({error:'Themes unavailable'},{status:503});
  return NextResponse.json({themes:data??[]});
}
async function mutate(request:Request,action:'theme_create'|'theme_set'){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const raw=await request.text().catch(()=>'');if(raw.length>(action==='theme_create'?60000:1000))return NextResponse.json({error:'Payload too large'},{status:413});
  let body:unknown;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=(action==='theme_create'?z.object({name,css_overrides:z.string().max(50000).default('')}).strict():z.object({name,is_active:z.boolean()}).strict()).safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Invalid theme'},{status:422});
  const payload={...parsed.data};
  try{if('css_overrides'in payload)payload.css_overrides=normalizeThemeCss(payload.css_overrides);}catch{return NextResponse.json({error:'Invalid theme CSS'},{status:422});}
  try{
    const theme=await applyAdminConfiguration(request,guard.userId,action,payload);
    return NextResponse.json({ok:true,theme},{status:action==='theme_create'?201:200});
  }catch(error){return NextResponse.json({error:'Theme update unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
export const POST=(request:Request)=>mutate(request,'theme_create');
export const PATCH=(request:Request)=>mutate(request,'theme_set');
