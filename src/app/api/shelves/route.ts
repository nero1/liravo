import {getEditionIds} from '@/services/books';
import { z } from 'zod';
import { contentIntent,ContentIntentError,getContentCreationReceipt } from '@/lib/content-intents';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// GET /api/shelves?bookId=xxx — list user's shelves and which ones contain bookId
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if(request.headers.has('X-Liravo-Actor')&&request.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get('bookId');
  if(searchParams.has('receipt'))try{return NextResponse.json({shelf:await getContentCreationReceipt(user.id,'shelves',searchParams.get('receipt')??''),actorId:user.id},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return NextResponse.json({error:'Shelf receipt unavailable'},{status:error instanceof ContentIntentError?error.status:503});}

  const { data: shelves,error } = await supabase
    .from('shelves')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false });

  if(error)return NextResponse.json({error:'Shelves unavailable'},{status:503});
  let addedToShelves: string[] = [];
  if(bookId&&!z.string().uuid().safeParse(bookId).success)return NextResponse.json({error:'Invalid book'},{status:400});
  if (bookId) {
    let editionIds:string[];try{editionIds=await getEditionIds(bookId);}catch{return NextResponse.json({error:'Edition identities unavailable'},{status:503});}
    const { data: existing,error:membershipError } = await supabase
      .from('shelf_books')
      .select('shelf_id')
      .in('book_id',editionIds)
      .eq('user_id', user.id);
    if(membershipError)return NextResponse.json({error:'Shelf membership unavailable'},{status:503});
    addedToShelves=[...new Set((existing??[]).map((e:{shelf_id:string})=>e.shelf_id))];
  }

  return NextResponse.json({ shelves: shelves ?? [], addedToShelves });
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
