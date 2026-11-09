import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {CatalogIdentityError,discoverOpenLibraryEditions,getWorkCatalog,searchOpenLibrary,storeCatalogBook} from '@/services/books';
export const dynamic='force-dynamic';
export async function POST(request:Request, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid work'},{status:400});
  const parsed=z.object({cursor:z.string().max(300).nullable().optional()}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid editions page'},{status:422});
  let offset=0;
  if(parsed.data.cursor){try{const cursor=z.object({workId:z.literal(params.id),offset:z.number().int().min(0).max(100000)}).parse(JSON.parse(Buffer.from(parsed.data.cursor,'base64url').toString()));offset=cursor.offset;}catch{return NextResponse.json({error:'Invalid editions cursor'},{status:400});}}
  if(!(await checkRouteRateLimit(user.id,'catalog')))return NextResponse.json({error:'Edition lookup limit reached'},{status:429});
  try{
    let catalog=await getWorkCatalog(params.id);if(!catalog)return NextResponse.json({error:'Work not found'},{status:404});
    const signal=AbortSignal.timeout(18000);
    if(!catalog.work.open_library_id){
      const representative=catalog.editions.find(edition=>edition.isbn_13||edition.isbn_10);
      if(!representative)return NextResponse.json({error:'No edition provider for this work'},{status:409});
      const matches=await searchOpenLibrary(representative.isbn_13??representative.isbn_10!,1,signal);
      const resolved=matches[0];if(!resolved?.open_library_work_id)throw new Error('Work identity unavailable');
      const edition=await storeCatalogBook(resolved);catalog=await getWorkCatalog(edition.work_id);if(!catalog?.work.open_library_id)throw new Error('Work identity unavailable');
    }
    const page=await discoverOpenLibraryEditions({...catalog.work,open_library_id:catalog.work.open_library_id},offset,signal);
    const stored=await Promise.allSettled(page.books.map(storeCatalogBook));
    if(stored.some(result=>result.status==='rejected'&&!(result.reason instanceof CatalogIdentityError)))throw new Error('Edition catalog unavailable');
    const current=await getWorkCatalog(catalog.work.id);if(!current)throw new Error('Work catalog unavailable');
    return NextResponse.json({work:current.work,localCursor:current.nextCursor,skipped:page.skipped+stored.filter(result=>result.status==='rejected').length,editions:[...new Map([...current.editions,...stored.flatMap(result=>result.status==='fulfilled'?[result.value]:[])].map(edition=>[edition.id,edition])).values()],providerCursor:page.nextOffset===null?null:Buffer.from(JSON.stringify({workId:catalog.work.id,offset:page.nextOffset})).toString('base64url'),providerComplete:page.nextOffset===null});
  }catch{return NextResponse.json({error:'Edition lookup unavailable'},{status:503});}
}
