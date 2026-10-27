import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/moderation';
import { getRequestCorrelationId } from '@/lib/utils';

export const dynamic='force-dynamic';
const fields={start_date:z.string().datetime(),end_date:z.string().datetime(),placement:z.enum(['discover_top','book_page_sidebar']),is_active:z.boolean()};
const createSchema=z.object({...fields,book_id:z.string().uuid(),author_id:z.string().uuid().nullable().optional(),is_active:z.boolean().default(true)}).strict().refine(value=>Date.parse(value.end_date)>Date.parse(value.start_date));
const updateSchema=z.object(fields).partial().strict().refine(value=>Object.keys(value).length>0);
export async function GET(){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const {data,error}=await createServiceClient().from('promoted_listings').select('id,book_id,author_id,created_by,start_date,end_date,placement,is_active,clicks,price_usd,created_at,book:books(title,author_name)').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
  if(error)return NextResponse.json({error:'Promotions unavailable'},{status:503});
  return NextResponse.json({listings:data??[]});
}
async function mutate(request:Request,method:'create'|'update'|'delete'){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const form=request.headers.get('content-type')?.includes('application/x-www-form-urlencoded');
  let raw:Record<string,unknown>,action:string=method,key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');
  if(form){
    const data=await request.formData().catch(()=>null);
    if(!data)return NextResponse.json({error:'Invalid form'},{status:400});
    action=String(data.get('_action')??method);key=String(data.get('_idempotency')??'');
    raw=Object.fromEntries([...data.entries()].filter(([name])=>['id','book_id','author_id','start_date','end_date','placement','is_active'].includes(name)));
    if('is_active'in raw){if(!['true','false'].includes(String(raw.is_active)))return NextResponse.json({error:'Invalid activation'},{status:422});raw.is_active=raw.is_active==='true';}
    for(const name of ['start_date','end_date'])if(typeof raw[name]==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw[name]))raw[name]+=':00Z';
  }else{
    const value=await request.json().catch(()=>null);
    raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    if(method==='delete'&&!raw.id)raw.id=new URL(request.url).searchParams.get('id');
  }
  if(!['create','update','delete'].includes(action)||!key||key.length<8||key.length>200)return NextResponse.json({error:'Missing/invalid promotion intent'},{status:400});
  const id=action==='create'?null:raw.id;
  if(action!=='create'&&!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Invalid listing'},{status:422});
  const body=Object.fromEntries(Object.entries(raw).filter(([name])=>name!=='id'));
  const parsed=action==='delete'?z.object({}).strict().safeParse(body):(action==='create'?createSchema:updateSchema).safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Invalid promotion dates or fields'},{status:422});
  const {data,error}=await createServiceClient().rpc('apply_promotion_intent' as never,{p_actor:guard.userId,p_action:action,p_id:id,p_key:key,p_data:parsed.data,p_correlation_id:getRequestCorrelationId(request)} as never);
  if(error){
    if(form)return new Response(null,{status:303,headers:{Location:'/admin/promoted-listings?error=update'}});
    return NextResponse.json({error:'Promotion update unavailable'},{status:({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503});
  }
  if(form)return new Response(null,{status:303,headers:{Location:'/admin/promoted-listings'}});
  return NextResponse.json(action==='delete'?data:{listing:data},{status:action==='create'?201:200});
}
export const POST=(request:Request)=>mutate(request,'create');
export const PATCH=(request:Request)=>mutate(request,'update');
export const DELETE=(request:Request)=>mutate(request,'delete');
