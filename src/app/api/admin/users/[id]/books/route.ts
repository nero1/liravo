import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/moderation';
import {createServiceClient} from '@/lib/supabase/server';
import {getAuthorCatalog} from '@/lib/author-catalog';
import {decodeCursor} from '@/lib/pagination';
import {normalizedIsbn,isbn13From10} from '@/lib/catalog-book';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {z} from 'zod';
export const dynamic='force-dynamic';
const schema=z.object({book_id:z.string().uuid(),granted:z.boolean()}).strict();
export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const auth=await requireAdmin();if(auth instanceof NextResponse)return auth;
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid author'},{status:400});
  const url=new URL(request.url),cursor=url.searchParams.get('cursor'),q=(url.searchParams.get('q')??'').trim();
  try{decodeCursor(cursor);}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  if(q.length>200)return NextResponse.json({error:'Search too long'},{status:400});
  try{
    const service=createServiceClient(),[authorResult,verificationResult,catalog]=await Promise.all([
      service.from('users').select('id,username,display_name,is_verified_author').eq('id',params.id).is('deleted_at',null).maybeSingle(),
      service.from('author_verification_requests').select('id,pen_name,publisher,book_titles,website_url,social_proof_url,status,created_at').eq('user_id',params.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle(),
      getAuthorCatalog(params.id,cursor),
    ]);
    if(authorResult.error||verificationResult.error)throw Error('Author unavailable');
    if(!authorResult.data)return NextResponse.json({error:'Author not found'},{status:404});
    let matches:unknown[]=[];
    if(q.length>=2){
      const isbn10=normalizedIsbn(q,10),isbn=normalizedIsbn(q,13)??(isbn10?isbn13From10(isbn10):null);
      let query=service.from('books').select('id,work_id,title,author_name,isbn_13').is('canonical_edition_id',null);
      query=isbn?query.eq('isbn_13',isbn):query.textSearch('search_vector',q,{type:'websearch',config:'simple'});
      const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(20);if(error)throw error;matches=data??[];
    }
    return NextResponse.json({actorId:auth.userId,author:authorResult.data,verification:verificationResult.data,...catalog,matches},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Author catalog unavailable'},{status:503});}
}
export async function PUT(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const auth=await requireAdmin();if(auth instanceof NextResponse)return auth;
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==auth.userId)return NextResponse.json({error:'Account changed'},{status:409});
  const key=request.headers.get('Idempotency-Key'),parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!z.string().uuid().safeParse(params.id).success||!key||key.length<8||key.length>200||!parsed.success)return NextResponse.json({error:'Invalid author catalog intent'},{status:400});
  if(!(await checkRouteRateLimit(auth.userId,'social')))return NextResponse.json({error:'Too many requests'},{status:429});
  const {data,error}=await createServiceClient().rpc('set_author_work_claim',{p_actor:auth.userId,p_author:params.id,p_book:parsed.data.book_id,p_granted:parsed.data.granted,p_key:key});
  if(error)return NextResponse.json({error:'Author catalog update failed'},{status:({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503});
  return NextResponse.json({actorId:auth.userId,...data as Record<string,unknown>},{headers:{'Cache-Control':'private, no-store'}});
}
