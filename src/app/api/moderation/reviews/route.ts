import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {createServiceClient} from '@/lib/supabase/server';
import {decodeCursor,encodeCursor} from '@/lib/pagination';
import {requestJson,BodyError} from '@/lib/request-body';
import {checkRouteRateLimit} from '@/lib/rate-limit';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'},status=(code?:string)=>({P1001:409,P1003:403,P1004:400,P1005:404}as Record<string,number>)[code??'']??503;
const review=z.object({id:z.string().uuid(),created_at:z.string().datetime({offset:true}),content:z.string(),username:z.string(),title:z.string(),rating:z.number().min(1).max(5),book_id:z.string().uuid()});
const receipt=z.object({reviewId:z.string().uuid(),userId:z.string().uuid(),status:z.enum(['pending','published','removed']),changed:z.boolean()});
export async function GET(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(!await checkRouteRateLimit('review-moderation:'+user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429,headers});
 let before;try{before=decodeCursor(new URL(request.url).searchParams.get('cursor'));}catch{return NextResponse.json({error:'Invalid cursor'},{status:400,headers});}
 const {data,error}=await createServiceClient().rpc('pending_review_snapshot' as never,{p_actor:user.id,p_at:before?.at??null,p_id:before?.id??null,p_limit:20} as never);
 const parsed=z.array(review).max(21).safeParse(data);
 if(error||!parsed.success)return NextResponse.json({error:'Moderation unavailable'},{status:status(error?.code),headers});
 const rows=parsed.data.slice(0,20),last=rows.at(-1);return NextResponse.json({actorId:user.id,reviews:rows,nextCursor:parsed.data.length>20&&last?encodeCursor({at:last.created_at,id:last.id}):null},{headers});
}
export async function PATCH(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409,headers});
 if(!await checkRouteRateLimit('review-moderation:'+user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429,headers});
 try{
  const parsed=z.object({reviewId:z.string().uuid(),status:z.enum(['published','removed'])}).strict().safeParse(await requestJson(request,1024));if(!parsed.success)return NextResponse.json({error:'Invalid decision'},{status:400,headers});
  const {data,error}=await createServiceClient().rpc('finish_review_moderation' as never,{p_actor:user.id,p_review:parsed.data.reviewId,p_status:parsed.data.status} as never);
  const checked=receipt.safeParse(data);if(error||!checked.success||checked.data.reviewId!==parsed.data.reviewId)return NextResponse.json({error:'Moderation unavailable'},{status:status(error?.code),headers});
  return NextResponse.json({actorId:user.id,...checked.data},{headers});
 }catch(error){return NextResponse.json({error:'Moderation unavailable'},{status:error instanceof BodyError?error.status:503,headers});}
}
