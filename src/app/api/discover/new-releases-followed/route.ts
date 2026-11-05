import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getFollowedAuthorBooks,DiscoveryError} from '@/lib/discovery';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const actor=request.headers.get('X-Liravo-Actor'),query=new URL(request.url).searchParams.get('userId');if(actor&&actor!==user.id||query&&query!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
 try{return NextResponse.json({books:await getFollowedAuthorBooks(user.id),actorId:user.id},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Discovery unavailable'},{status:error instanceof DiscoveryError?error.status:503});}
}
