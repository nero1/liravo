import {applyCommunityIntent} from '@/lib/community-intents';
import {ContentIntentError} from '@/lib/content-intents';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getBookPasses,getBookChainRoster,BookPassingError} from '@/lib/book-passing';
export const dynamic='force-dynamic';
const schema=z.object({book_id:z.string().uuid(),note:z.string().max(500).optional()});
export async function GET(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});const query=new URL(request.url).searchParams;
 try{if(query.has('chainId'))return NextResponse.json(await getBookChainRoster(user.id,query.get('chainId')??'',query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});const{items,...metadata}=await getBookPasses(user.id,'chains',query.get('cursor'));return NextResponse.json({chains:items,...metadata},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Chains unavailable'},{status:error instanceof BookPassingError?error.status:503});}
}
export async function POST(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid input'},{status:400});
 try{return NextResponse.json(await applyCommunityIntent(request,user.id,'chain_create',parsed.data.book_id,{note:parsed.data.note??null}),{status:201,headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Chain unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
