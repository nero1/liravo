import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {requireAdmin} from '@/lib/moderation';

const cursorSchema=z.object({actorId:z.string().uuid(),scope:z.string(),search:z.string().max(200),at:z.string().datetime({offset:true}),key:z.string().min(1).max(200)}).strict();
export type AdminCatalogScope='users'|'books'|'themes'|'promotions'|'seasons'|'writing';
export async function adminCatalogResponse(request:Request,scope:AdminCatalogScope,field:string){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const params=new URL(request.url).searchParams,search=params.get('search')?.trim()??'',raw=params.get('cursor'),page=Number(params.get('page')??'1');
  if(search.length>200||!Number.isInteger(page)||page<1||page>10001||raw&&raw.length>2000||raw&&page!==1)return NextResponse.json({error:'Invalid admin page'},{status:400});
  let cursor:z.infer<typeof cursorSchema>|null=null;
  if(raw)try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString()));if(cursor.actorId!==guard.userId||cursor.scope!==scope||cursor.search!==search)throw Error();}catch{return NextResponse.json({error:'Invalid admin cursor'},{status:400});}
  try{
    const {data,error}=await createServiceClient().rpc('admin_catalog_snapshot' as never,{p_user:guard.userId,p_scope:scope,p_search:search,p_at:cursor?.at??null,p_key:cursor?.key??null,p_limit:25,p_offset:(page-1)*25} as never);
    if(error||!data)return NextResponse.json({error:'Admin catalog unavailable'},{status:error?.code==='P1003'?403:503});
    const snapshot=data as {total:number;rows:{item:Record<string,unknown>;at:string;key:string}[]},rows=snapshot.rows.slice(0,25),last=rows.at(-1),nextCursor=snapshot.rows.length>25&&last?Buffer.from(JSON.stringify({actorId:guard.userId,scope,search,at:last.at,key:last.key})).toString('base64url'):null;
    return NextResponse.json({[field]:rows.map(row=>row.item),total:snapshot.total,nextCursor,actorId:guard.userId,page,pageSize:25},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Admin catalog unavailable'},{status:503});}
}
