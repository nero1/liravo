import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
import { requireAdmin } from '@/lib/moderation';
export async function GET(request:Request){
  const guard=await requireAdmin();if(guard instanceof NextResponse)return guard;
  const search=new URL(request.url).searchParams.get('search')?.trim()??'';
  if(search.length>200)return NextResponse.json({error:'Search is too long'},{status:400});
  let query=createServiceClient().from('books').select('*').order('created_at',{ascending:false}).order('id').limit(50);
  if(search)query=query.textSearch('search_vector',search,{type:'websearch',config:'english'});
  const {data,error}=await query;
  if(error)return NextResponse.json({error:'Books unavailable'},{status:503});
  return NextResponse.json({books:(data??[]).map(book=>({...book,average_rating:book.average_rating===null?null:Number(book.average_rating)}))});
}
