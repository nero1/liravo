import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {requireAdmin} from '@/lib/moderation';
import {checkRouteRateLimit} from '@/lib/rate-limit';
export const dynamic='force-dynamic';
const schema=z.object({has_audiobook:z.boolean()}).strict();
async function access(request:Request,id:string){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==guard.userId)return NextResponse.json({error:'Account changed'},{status:409});
  if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Invalid book'},{status:400});return guard;
}
async function result(name:string,args:Record<string,unknown>){
  try{const{data,error}=await createServiceClient().rpc(name as never,args as never);if(error||!data)return NextResponse.json({error:'Audiobook state unavailable'},{status:({P1003:403,P1004:400,P1005:404}as Record<string,number>)[error?.code??'']??503});const receipt=z.object({actorId:z.string().uuid(),bookId:z.string().uuid(),editionId:z.string().uuid(),has_audiobook:z.boolean(),updated:z.boolean().optional()}).safeParse(data);if(!receipt.success||receipt.data.actorId!==args.p_actor||receipt.data.bookId!==args.p_book||name==='set_admin_edition_audiobook'&&(receipt.data.updated!==true||receipt.data.has_audiobook!==args.p_enabled))return NextResponse.json({error:'Audiobook state unavailable'},{status:503});return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'Audiobook state unavailable'},{status:503});}
}
export async function GET(request:Request,{params}:{params:{id:string}}){const guard=await access(request,params.id);return guard instanceof NextResponse?guard:result('admin_edition_audiobook_snapshot',{p_actor:guard.userId,p_book:params.id.toLowerCase()});}
export async function PATCH(request:Request,{params}:{params:{id:string}}){
  const guard=await access(request,params.id);if(guard instanceof NextResponse)return guard;
  if(!await checkRouteRateLimit(guard.userId,'social'))return NextResponse.json({error:'Too many requests'},{status:429});
  const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>2048)return NextResponse.json({error:'Payload too large'},{status:413});
  let body:unknown;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid audiobook state'},{status:400});
  return result('set_admin_edition_audiobook',{p_actor:guard.userId,p_book:params.id.toLowerCase(),p_enabled:parsed.data.has_audiobook});
}
