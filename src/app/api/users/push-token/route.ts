import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {PushSubscriptionError,registerPush,unregisterPush} from '@/lib/push-subscriptions';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {BodyError,requestJson} from '@/lib/request-body';
export const dynamic='force-dynamic';
const schema=z.object({token:z.string().max(500).regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),platform:z.enum(['ios','android'])}),headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429,headers});
 try{const parsed=schema.safeParse(await requestJson(request,1024));if(!parsed.success)return NextResponse.json({error:'Invalid token'},{status:400,headers});await registerPush(user.id,'expo',parsed.data.token,undefined,parsed.data.platform);return NextResponse.json({ok:true,actorId:user.id},{headers});}
 catch(error){return NextResponse.json({error:'Push registration unavailable'},{status:error instanceof BodyError||error instanceof PushSubscriptionError?error.status:503,headers});}
}
export async function DELETE(){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{await unregisterPush(user.id);return NextResponse.json({ok:true,actorId:user.id},{headers});}catch{return NextResponse.json({error:'Push revocation unavailable'},{status:503,headers});}
}
