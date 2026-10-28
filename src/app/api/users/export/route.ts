import {createServiceClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {getClientIp} from '@/lib/utils';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
export const dynamic='force-dynamic';
interface ReadingEntry {
  added_at:string;finished_at:string|null;started_at:string|null;progress_pages:number|null;progress_percent:number|null;edition_read:string|null;
  books:{id:string;google_books_id:string|null;open_library_id:string|null;goodreads_id:string|null;title:string;author_name:string;isbn_13:string|null;isbn_10:string|null;language:string;format:string|null;publisher:string|null;published_year:number|null;page_count:number|null};
  shelves:{name:string;default_type:string|null};
}
function csvCell(value:unknown){
  let text=String(value??'');
  if(typeof value==='string'&&/^[\s]*[=+\-@]|^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export async function GET(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const ip=getClientIp(req);
  if(!(await checkCriticalRateLimit('export:user:'+user.id)).allowed||ip!=='unknown'&&!(await checkCriticalRateLimit('export:ip:'+ip)).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  const format=new URL(req.url).searchParams.get('format');
  if(format&&!['json','csv'].includes(format))return NextResponse.json({error:'Invalid export format'},{status:400});
  const {data,error}=await createServiceClient().rpc('account_data_export' as never,{p_user_id:user.id} as never);
  if(error||!data||!Array.isArray((data as {reading_history?:unknown}).reading_history))return NextResponse.json({error:'Export unavailable; no partial file was produced'},{status:503});
  const date=new Date().toISOString().slice(0,10),headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(format==='csv'||!format&&req.headers.get('accept')?.includes('text/csv')){
    const rows:unknown[][]=[['Title','Author','ISBN13','ISBN','Language','Binding','Publisher','Year Published','Number of Pages','Shelf','Exclusive Shelf','Date Added','Date Started','Date Read','Pages Read','Progress Percent','Edition','Liravo Book ID','Google Books ID','Open Library ID','Book Id']];
    for(const entry of (data as {reading_history:ReadingEntry[]}).reading_history){const b=entry.books;rows.push([b.title,b.author_name,b.isbn_13,b.isbn_10,b.language,b.format,b.publisher,b.published_year,b.page_count,entry.shelves.name,({have_read:'read',currently_reading:'currently-reading',want_to_read:'to-read'} as Record<string,string>)[entry.shelves.default_type??'']??'to-read',entry.added_at,entry.started_at,entry.finished_at,entry.progress_pages,entry.progress_percent,entry.edition_read,b.id,b.google_books_id,b.open_library_id,b.goodreads_id]);}
    return new Response(rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="liravo-reading-history-${date}.csv"`}});
  }
  return new Response(JSON.stringify(data,null,2),{headers:{...headers,'Content-Type':'application/json','Content-Disposition':`attachment; filename="liravo-data-export-${date}.json"`}});
}
