import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {PushSubscriptionError,registerPush,unregisterPush,trustedPushEndpoint,validPushKeys} from '@/lib/push-subscriptions';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {BodyError,requestJson} from '@/lib/request-body';
export const dynamic='force-dynamic';
const schema=z.object({endpoint:z.string().max(2048).refine(trustedPushEndpoint),keys:z.object({p256dh:z.string().max(100),auth:z.string().max(32)})}).refine(value=>validPushKeys(value.keys.p256dh,value.keys.auth));
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429,headers});
 try{
  const parsed=schema.safeParse(await requestJson(request,4096));if(!parsed.success)return NextResponse.json({error:'Invalid subscription'},{status:400,headers});
  await registerPush(user.id,'web',parsed.data.endpoint,parsed.data.keys);return NextResponse.json({ok:true,actorId:user.id},{headers});
 }catch(error){return NextResponse.json({error:'Subscription unavailable'},{status:error instanceof BodyError||error instanceof PushSubscriptionError?error.status:503,headers});}
}
export async function DELETE(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{const parsed=z.object({endpoint:z.string().max(2048).refine(trustedPushEndpoint)}).safeParse(await requestJson(request,4096));if(!parsed.success)return NextResponse.json({error:'Invalid subscription'},{status:400,headers});await unregisterPush(user.id,parsed.data.endpoint);return NextResponse.json({ok:true,actorId:user.id},{headers});}
 catch(error){return NextResponse.json({error:'Subscription unavailable'},{status:error instanceof BodyError||error instanceof PushSubscriptionError?error.status:503,headers});}
}
