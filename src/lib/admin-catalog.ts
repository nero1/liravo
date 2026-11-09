import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {requireAdmin} from '@/lib/moderation';

const cursorSchema=z.object({actorId:z.string().uuid(),scope:z.string(),search:z.string().max(200),at:z.string().datetime({offset:true}),key:z.string().min(1).max(200)}).strict();
export type AdminCatalogScope='users'|'books'|'themes'|'promotions'|'seasons'|'writing';
export class AdminCatalogError extends Error{constructor(message:string,public status:number){super(message);}}
export async function readAdminCatalog<T=Record<string,unknown>>(actorId:string,scope:AdminCatalogScope,{search='',cursor:raw=null,page=1}:{search?:string;cursor?:string|null;page?:number}={}){
  if(typeof search!=='string'||raw!==null&&typeof raw!=='string')throw new AdminCatalogError('Invalid admin page',400);
  search=search.trim();
  if(search.length>200||!Number.isInteger(page)||page<1||page>10001||raw&&raw.length>2000||raw&&page!==1)throw new AdminCatalogError('Invalid admin page',400);
  let cursor:z.infer<typeof cursorSchema>|null=null;
  if(raw)try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString()));if(cursor.actorId!==actorId||cursor.scope!==scope||cursor.search!==search)throw Error();}catch{throw new AdminCatalogError('Invalid admin cursor',400);}
  const {data,error}=await createServiceClient().rpc('admin_catalog_snapshot',{p_user:actorId,p_scope:scope,p_search:search,p_at:cursor?.at??null,p_key:cursor?.key??null,p_limit:25,p_offset:(page-1)*25});
  if(error||!data)throw new AdminCatalogError('Admin catalog unavailable',error?.code==='P1003'?403:503);
  const snapshot=data as {total:number;rows:{item:T;at:string;key:string}[]},rows=snapshot.rows.slice(0,25),last=rows.at(-1),nextCursor=snapshot.rows.length>25&&last?Buffer.from(JSON.stringify({actorId,scope,search,at:last.at,key:last.key})).toString('base64url'):null;
  return {items:rows.map(row=>row.item),total:snapshot.total,nextCursor,actorId,page,pageSize:25};
}
export async function adminCatalogResponse(request:Request,scope:AdminCatalogScope,field:string){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const params=new URL(request.url).searchParams;
  try{const{items,...metadata}=await readAdminCatalog(guard.userId,scope,{search:params.get('search')??'',cursor:params.get('cursor'),page:Number(params.get('page')??'1')});return NextResponse.json({[field]:items,...metadata},{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return NextResponse.json({error:error instanceof AdminCatalogError?error.message:'Admin catalog unavailable'},{status:error instanceof AdminCatalogError?error.status:503});}
}
