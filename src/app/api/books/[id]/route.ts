import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
import { getBookById,buildAffiliateLinks,getAudibleLink } from '@/services/books';
export async function GET(request:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid book'},{status:400});
  try{
    const book=await getBookById(params.id);
    if(!book)return NextResponse.json({error:'Book not found'},{status:404});
    const {data:profile,error}=await createServiceClient().from('users').select('country,preferred_locale').eq('id',user.id).single();
    if(error)throw error;
    const affiliateLinks=await buildAffiliateLinks(book,profile?.country??'US',profile?.preferred_locale);
    return NextResponse.json({book,affiliateLinks,audibleLink:getAudibleLink(book,profile?.preferred_locale??'en',profile?.country??'US')});
  }catch{return NextResponse.json({error:'Book unavailable'},{status:503});}
}
