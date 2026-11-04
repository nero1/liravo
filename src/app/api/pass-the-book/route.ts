import {contentIntent,ContentIntentError} from '@/lib/content-intents';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getBookPasses,getBookPassReceipt,BookPassingError} from '@/lib/book-passing';
export const dynamic='force-dynamic';
const schema=z.object({book_id:z.string().uuid(),recipient_id:z.string().uuid(),message:z.string().max(500).optional()});
export async function POST(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid body'},{status:400});
 try{const intent=await contentIntent(request,user.id,'book_passes',{...parsed.data,message:parsed.data.message??null}),pass=await intent.insert();return NextResponse.json({success:true,actorId:user.id,pass},{status:201,headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Book pass unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
export async function GET(request:Request){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});const query=new URL(request.url).searchParams,scope=query.get('scope');
 try{
  if(query.has('receipt'))return NextResponse.json(await getBookPassReceipt(user.id,query.get('action')??'',query.get('receipt')??''),{headers:{'Cache-Control':'private, no-store'}});
  if(scope){if(scope!=='received'&&scope!=='sent')return NextResponse.json({error:'Invalid catalog'},{status:400});return NextResponse.json(await getBookPasses(user.id,scope,query.get('cursor')),{headers:{'Cache-Control':'private, no-store'}});}
  if(query.has('cursor'))return NextResponse.json({error:'Scope required'},{status:400});
  const[received,sent]=await Promise.all([getBookPasses(user.id,'received'),getBookPasses(user.id,'sent')]);return NextResponse.json({actorId:user.id,received:received.items,sent:sent.items,receivedTotal:received.total,sentTotal:sent.total,receivedNextCursor:received.nextCursor,sentNextCursor:sent.nextCursor},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:'Book passes unavailable'},{status:error instanceof BookPassingError?error.status:503});}
}
