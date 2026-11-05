import {getShelfCatalog,ShelfError} from '@/lib/shelf-catalog';
import { z } from 'zod';
import { contentIntent,ContentIntentError,getContentCreationReceipt } from '@/lib/content-intents';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(request:NextRequest){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
 const query=new URL(request.url).searchParams;
 try{if(query.has('receipt'))return NextResponse.json({shelf:await getContentCreationReceipt(user.id,'shelves',query.get('receipt')??''),actorId:user.id},{headers:{'Cache-Control':'private, no-store'}});
  return NextResponse.json(await getShelfCatalog(user.id,query.get('bookId'),query.get('cursor'),Number(query.get('limit')??50)),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:'Shelves unavailable'},{status:error instanceof ShelfError||error instanceof ContentIntentError?error.status:503});}
}

export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const parsed=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(2000).optional(),is_public:z.boolean().default(true)}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid shelf'},{status:422});
  try{
    const intent=await contentIntent(request,user.id,'shelves',{...parsed.data,description:parsed.data.description??null});
    const shelf=await intent.insert();
    return NextResponse.json({shelf,actorId:user.id},{status:201,headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Shelf creation unavailable'},{status:error instanceof ContentIntentError?error.status:503});}
}
