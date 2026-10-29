import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {normalizedIsbn,isbn13From10} from '@/lib/catalog-book';
import { searchBooks,storeCatalogBook } from '@/services/books';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const raw=searchParams.get('q')?.trim(),isbn10=normalizedIsbn(raw,10);
  const q=normalizedIsbn(raw,13)??(isbn10?isbn13From10(isbn10):raw);
  if (!q || q.length < 2) return NextResponse.json({ books: [] });

  if(q.length>200)return NextResponse.json({error:'Search is too long'},{status:400});

  const supabase = createServiceClient();

  const columns='id,work_id,title,author_name,cover_url,published_year,google_books_id,isbn_10,isbn_13,publisher,language,edition_name,format';
  if(normalizedIsbn(q,13)){
    const {data:exact,error}=await supabase.from('books').select(columns).is('canonical_edition_id',null).eq('isbn_13',q).maybeSingle();
    if(error)return NextResponse.json({error:'Book catalog unavailable'},{status:503});
    if(exact)return NextResponse.json({books:[exact],source:'local'});
  }

  // Search local DB first
  const { data: localBooks } = await supabase
    .from('books')
    .select(columns)
    .is('canonical_edition_id',null)
    .textSearch('search_vector', q,{type:'websearch',config:'simple'})
    .limit(10);

  if (localBooks && localBooks.length >= 5) {
    return NextResponse.json({ books: localBooks, source: 'local' });
  }

  if(!await checkRouteRateLimit(user.id,'catalog'))return localBooks?.length?NextResponse.json({books:localBooks,source:'local'}):NextResponse.json({error:'Search limit reached'},{status:429});

  try{
    const results=await searchBooks(q);
    const stored=await Promise.allSettled(results.map(book=>storeCatalogBook(book)));
    const books=new Map((localBooks??[]).map(book=>[book.id,book]));
    for(const result of stored)if(result.status==='fulfilled')books.set(result.value.id,result.value);
    if(!books.size&&stored.some(result=>result.status==='rejected'))return NextResponse.json({error:'Book catalog unavailable'},{status:503});
    return NextResponse.json({books:[...books.values()].slice(0,10),source:'catalog'});
  }catch{
    if(localBooks?.length)return NextResponse.json({books:localBooks,source:'local'});
    return NextResponse.json({error:'Book search unavailable'},{status:503});
  }
}
