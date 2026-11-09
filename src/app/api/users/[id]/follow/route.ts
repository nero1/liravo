import {checkRouteRateLimit} from '@/lib/rate-limit';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'},status=(code:string)=>({P1001:409,P1003:403,P1004:422,P1005:404}as Record<string,number>)[code]??503;
async function apply(request:Request,params:{id:string},action:'follow'|'unfollow'|null){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409,headers});
 if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid target'},{status:400,headers});
 const key=action?request.headers.get('Idempotency-Key')??request.headers.get('X-Idempotency-Key'):new URL(request.url).searchParams.get('receipt');
 if(!key||key.length<8||key.length>200)return NextResponse.json({error:'Invalid follow intent'},{status:400,headers});
 if(action&&!(await checkRouteRateLimit(user.id,'social')))return NextResponse.json({error:'Too many requests'},{status:429,headers});
 const{data,error}=await createServiceClient().rpc((action?'apply_follow_intent_snapshot':'follow_intent_snapshot'),{p_actor:user.id,p_target:params.id,p_key:key,...(action ? {p_action:action} : {})});
 if(error||!data)return NextResponse.json({error:'Follow unavailable'},{status:error?status(error.code):503,headers});
 return NextResponse.json(data,{headers});
}
export async function GET(request:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 return apply(request,params,null);
}
export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 return apply(request,params,'follow');
}
export async function DELETE(request:Request, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 return apply(request,params,'unfollow');
}
