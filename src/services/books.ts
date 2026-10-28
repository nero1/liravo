import {createHash} from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import type { BookRow,WorkCatalog } from '@/types/database';
import { fetchWithRetry } from '@/lib/retry';
import { catalogBookData,clientBook,normalizedIsbn,isbn13From10,bookRating,editionFormat,editionNumber } from '@/lib/catalog-book';

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    pageCount?: number;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    language?: string;
    averageRating?: number;
    ratingsCount?: number;
  };
}

export async function searchGoogleBooks(query: string, maxResults=10,signal:AbortSignal=AbortSignal.timeout(18000)):Promise<GoogleBooksVolume[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('printType', 'books');
  if (apiKey) url.searchParams.set('key', apiKey);

  const res = await fetchWithRetry(url.toString(), {signal,next:{revalidate:3600}});
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.items)?data.items.filter((volume:GoogleBooksVolume)=>volume&&typeof volume.id==='string'&&volume.volumeInfo&&typeof volume.volumeInfo.title==='string'):[];
}

export function googleVolumeToBookData(volume: GoogleBooksVolume) {
  const info = volume.volumeInfo;
  const isbn13 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;
  const isbn10 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier;

  return {
    google_books_id: volume.id,
    title: info.title,
    subtitle: info.subtitle ?? null,
    author_name: info.authors?.[0] ?? 'Unknown',
    author_names: info.authors ?? [],
    publisher: info.publisher ?? null,
    published_year: editionNumber(info.publishedDate ? Number(info.publishedDate.slice(0,4)) : null,9999),
    description: info.description ?? null,
    cover_url: info.imageLinks?.thumbnail?.replace('http:', 'https:') ?? null,
    page_count: editionNumber(info.pageCount,100000),
    genres: info.categories ?? [],
    language: info.language??'und',
    isbn_13: isbn13 ?? null,
    isbn_10: isbn10 ?? null,
    average_rating: info.averageRating ?? null,
    ratings_count: info.ratingsCount ?? 0,
  };
}

interface OpenLibraryDoc {key:string;title:string;author_name?:string[];edition_key?:string[];subject?:string[];}
interface OpenLibraryEdition {
  key:string;title:string;subtitle?:string;works?:{key:string}[];authors?:{key:string}[];isbn_13?:string[];isbn_10?:string[];
  publishers?:string[];publish_date?:string;number_of_pages?:number;covers?:number[];languages?:{key:string}[];physical_format?:string;edition_name?:string;
}
const openLibraryWork=(value:unknown):value is string=>typeof value==='string'&&/^\/works\/OL[1-9]\d*W$/.test(value);
const openLibraryEdition=(value:unknown):value is string=>typeof value==='string'&&/^\/books\/OL[1-9]\d*M$/.test(value);
export function openLibraryEditionToBookData(edition:OpenLibraryEdition,context?:{key?:string;title?:string;author_name?:string[];subject?:string[]}){
  if(!openLibraryEdition(edition.key))throw new Error('Invalid edition identity');
  const workKeys=(edition.works??[]).map(work=>work.key).filter(openLibraryWork);
  if(context?.key&&!workKeys.includes(context.key))throw new Error('Edition belongs to another work');
  if(workKeys.length>1)throw new Error('Ambiguous edition work');
  const codes13=[...new Set((edition.isbn_13??[]).map(value=>normalizedIsbn(value,13)).filter((value):value is string=>!!value))];
  const codes10=[...new Set((edition.isbn_10??[]).map(value=>normalizedIsbn(value,10)).filter((value):value is string=>!!value))];
  const identities=new Set([...codes13,...codes10.map(isbn13From10)]);
  if(identities.size>1)throw new Error('Ambiguous edition ISBNs');
  const format=editionFormat(edition.physical_format),language=edition.languages?.[0]?.key.split('/').at(-1)??'und';
  return catalogBookData({open_library_id:edition.key,open_library_work_id:workKeys[0],work_title:context?.title,title:edition.title,subtitle:edition.subtitle,
    author_name:context?.author_name?.[0]??'Unknown',author_names:context?.author_name??[],publisher:edition.publishers?.[0],published_year:editionNumber(Number(edition.publish_date?.match(/\b\d{4}\b/)?.[0]),9999),
    page_count:editionNumber(edition.number_of_pages,100000),cover_url:edition.covers?.some(id=>id>0)?`https://covers.openlibrary.org/b/id/${edition.covers.find(id=>id>0)}-L.jpg`:null,
    genres:context?.subject?.slice(0,5)??[],language:({eng:'en',fra:'fr',fre:'fr',deu:'de',ger:'de'} as Record<string,string>)[language]??language,
    isbn_13:codes13[0],isbn_10:codes10[0],edition_name:edition.edition_name??(!format?edition.physical_format:undefined),format});
}
async function openLibraryJson<T>(path:string,signal:AbortSignal):Promise<T>{
  const response=await fetchWithRetry('https://openlibrary.org'+path,{signal});return response.json();
}
export async function searchOpenLibrary(query:string,maxResults=10,signal:AbortSignal=AbortSignal.timeout(18000)){
  const isbn=normalizedIsbn(query,13)??(normalizedIsbn(query,10)?isbn13From10(normalizedIsbn(query,10)!):null);
  if(isbn){
    const edition=await openLibraryJson<OpenLibraryEdition>('/isbn/'+isbn+'.json',signal),workKey=edition.works?.map(work=>work.key).find(openLibraryWork);
    let context:{key?:string;title?:string;author_name?:string[]}|undefined;
    if(workKey){try{
      const work=await openLibraryJson<{title?:string}>(workKey+'.json',signal);
      if(typeof work.title==='string'&&work.title.length<=500)context={key:workKey,title:work.title};
    }catch{}}
    const authors=await Promise.all((edition.authors??[]).filter(author=>/^\/authors\/OL[1-9]\d*A$/.test(author.key)).slice(0,3).map(async author=>{
      try{const data=await openLibraryJson<{name?:string}>(author.key+'.json',signal);return typeof data.name==='string'&&data.name.length<=200?data.name:null;}catch{return null;}
    }));
    const names=authors.filter((name):name is string=>!!name);if(names.length)context={...context,author_name:names};
    const book=openLibraryEditionToBookData(edition,context);
    if(book.isbn_13!==isbn)throw new Error('ISBN lookup returned another edition');return [book];
  }

  const url=new URL('https://openlibrary.org/search.json');url.searchParams.set('q',query);url.searchParams.set('limit',String(maxResults));url.searchParams.set('fields','key,title,author_name,edition_key,subject');
  const response=await fetchWithRetry(url.toString(),{signal}),data=await response.json();
  if(!Array.isArray(data.docs))throw new Error('Invalid Open Library search');
  const docs=(data.docs as OpenLibraryDoc[]).filter(doc=>openLibraryWork(doc.key)&&typeof doc.title==='string').slice(0,maxResults),results:ReturnType<typeof catalogBookData>[]=[],queue=[...docs];
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
    let doc:OpenLibraryDoc|undefined;
    while((doc=queue.shift())&&!signal.aborted){
      try{
        const key=doc.edition_key?.find(value=>/^OL[1-9]\d*M$/.test(value));
        const edition=key?await openLibraryJson<OpenLibraryEdition>('/books/'+key+'.json',signal):(await openLibraryJson<{entries:OpenLibraryEdition[]}>(doc.key+'/editions.json?limit=1',signal)).entries?.[0];
        if(edition)results.push(openLibraryEditionToBookData(edition,doc));
      }catch{}
    }
  }));
  if(docs.length&&!results.length)throw new Error('Open Library editions unavailable');return results;
}
export async function discoverOpenLibraryEditions(work:{open_library_id:string;title:string;author_name:string},offset=0,signal:AbortSignal=AbortSignal.timeout(18000)){
  if(!openLibraryWork(work.open_library_id)||!Number.isInteger(offset)||offset<0||offset>100000)throw new Error('Invalid work page');
  const data=await openLibraryJson<{entries:OpenLibraryEdition[];size:number}>(work.open_library_id+'/editions.json?limit=20&offset='+offset,signal);
  if(!Array.isArray(data.entries)||data.entries.length>20||!Number.isInteger(data.size)||data.size<0)throw new Error('Invalid editions page');
  const books=data.entries.flatMap(edition=>{try{return [openLibraryEditionToBookData(edition,{key:work.open_library_id,title:work.title,author_name:[work.author_name]})];}catch{return [];}});
  return {books,skipped:data.entries.length-books.length,nextOffset:data.entries.length===20&&offset+20<data.size&&offset+20<=100000?offset+20:null};
}
export async function searchBooks(query:string,maxResults=10){
  const signal=AbortSignal.timeout(18000),googleVolumes=await searchGoogleBooks(query,maxResults,signal).catch(()=>[]);
  const googleResults=googleVolumes.flatMap(volume=>{try{return [catalogBookData(googleVolumeToBookData(volume))];}catch{return [];}});
  if(googleResults.length>=3)return googleResults;
  const olResults=await searchOpenLibrary(query,maxResults,signal).catch(error=>{if(googleResults.length)return [];throw error;});
  return [...googleResults,...olResults].slice(0,maxResults);
}

export class CatalogIdentityError extends Error {}
export async function storeCatalogBook(value:unknown):Promise<BookRow>{
  const payload=catalogBookData(value);
  const {data,error}=await createServiceClient().rpc('store_catalog_book' as never,{p_data:payload} as never);
  if(error&&['P1001','P1004','23505'].includes(error.code))throw new CatalogIdentityError('Conflicting edition identity');
  if(error||!data)throw new Error('Book catalog unavailable');
  return clientBook(data as BookRow);
}

export async function getOrCreateBook(googleBooksId:string):Promise<BookRow|null>{
  if(!/^[a-zA-Z0-9_-]{1,200}$/.test(googleBooksId))return null;
  const {data:identity,error}=await createServiceClient().from('book_edition_identifiers').select('book_id').eq('provider','google').eq('identifier',googleBooksId).maybeSingle();
  if(error)throw new Error('Book catalog unavailable');
  if(identity)return getBookById(identity.book_id);
  const url=new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(googleBooksId)}`);
  if(process.env.GOOGLE_BOOKS_API_KEY)url.searchParams.set('key',process.env.GOOGLE_BOOKS_API_KEY);
  const response=await fetchWithRetry(url.toString(),{signal:AbortSignal.timeout(18000)});
  const volume:GoogleBooksVolume=await response.json();
  if(volume.id!==googleBooksId)throw new Error('Book identity mismatch');
  return storeCatalogBook(googleVolumeToBookData(volume));
}

export async function getBookById(id:string):Promise<BookRow|null>{
  const {data,error}=await createServiceClient().rpc('catalog_book_snapshot' as never,{p_book_id:id} as never);
  if(error)throw new Error('Book catalog unavailable');return data?clientBook(data as BookRow):null;
}
export async function getEditionIds(id:string):Promise<string[]>{
  const {data,error}=await createServiceClient().rpc('book_edition_family' as never,{p_book_id:id} as never);
  if(error||!Array.isArray(data))throw new Error('Edition identities unavailable');return data as string[];
}

export async function resolveEditionMetadata<T extends {id:string;canonical_edition_id?:string|null}>(books:T[]):Promise<T[]>{
  const ids=[...new Set(books.flatMap(book=>book.canonical_edition_id?[book.canonical_edition_id]:[]))];
  if(!ids.length)return books;
  const {data,error}=await createServiceClient().from('books').select('id,work_id,canonical_edition_id,metadata_source,metadata_provenance,title,subtitle,author_name,author_names,cover_url,page_count,average_rating,isbn_10,isbn_13,publisher,published_year,language,format,edition_name,has_audiobook').in('id',ids);
  if(error)throw new Error('Edition metadata unavailable');
  const canonical=new Map((data??[]).map(book=>[book.id,{...book,average_rating:bookRating(book.average_rating)}]));
  return books.map(book=>book.canonical_edition_id?{...book,...canonical.get(book.canonical_edition_id)}:book);
}

export async function getWorkCatalog(workId:string,cursor:string|null=null):Promise<WorkCatalog|null>{
  const {data,error}=await createServiceClient().rpc('book_work_snapshot' as never,{p_work_id:workId,p_cursor:cursor,p_limit:50} as never);
  if(error)throw new Error('Work catalog unavailable');
  if(!data)return null;
  const catalog=data as WorkCatalog;return {...catalog,editions:catalog.editions.map(clientBook),statistics:{...catalog.statistics,average_rating:bookRating(catalog.statistics.average_rating)}};
}

const LOCALE_TO_COUNTRY: Record<string, string> = {
  fr: 'FR',
  de: 'DE',
  en: 'US',
};

export interface AffiliateLink {linkId:string;name:string;url:string;isAffiliate:boolean;isPrimary:boolean;storeId:string|null;storeVersion:string|null;country:string;}
function identifiedLink(link:Omit<AffiliateLink,'linkId'>,identity:string):AffiliateLink{
  const hash=createHash('sha256').update(JSON.stringify([link.country,link.storeVersion,link.name,link.url,link.isAffiliate,link.isPrimary])).digest('hex');
  return {...link,linkId:identity+':'+hash};
}
export async function buildAffiliateLinks(book:BookRow,country?:string,locale?:string):Promise<AffiliateLink[]>{
  const region=country&&/^[A-Za-z]{2}$/.test(country)?country.toUpperCase():LOCALE_TO_COUNTRY[locale??'']??'US';
  const {data:stores,error}=await createServiceClient().from('affiliate_stores').select('*').eq('is_active',true).order('priority',{ascending:true});
  if(error)throw new Error('Book stores unavailable');
  const links:AffiliateLink[]=[];
  for(const store of stores??[]){
    if(store.countries.length&&!store.countries.includes(region))continue;
    const raw=store.url_template.replaceAll('{isbn}',encodeURIComponent(book.isbn_13??book.isbn_10??'')).replaceAll('{tag}',encodeURIComponent(store.affiliate_tag??'')).replaceAll('{title}',encodeURIComponent(book.title));
    let url:URL;try{url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||/[{}]/.test(url.hostname))throw new Error('Invalid store URL');}catch{throw new Error('Book store configuration unavailable');}
    const version=typeof store.updated_at==='string'?store.updated_at:new Date(store.updated_at).toISOString();
    links.push(identifiedLink({name:store.name,url:url.toString(),isAffiliate:!store.is_non_affiliate,isPrimary:store.priority===1,storeId:store.id,storeVersion:version,country:region},store.id));
  }
  if(!links.length)links.push(identifiedLink({name:'WorldCat',url:'https://www.worldcat.org/search?q='+encodeURIComponent(book.isbn_13??book.title),isAffiliate:false,isPrimary:false,storeId:null,storeVersion:null,country:region},'worldcat'));
  return links;
}
export function getAudibleLink(book:Pick<BookRow,'id'|'title'|'has_audiobook'>,locale='en',country='US'):AffiliateLink|null{
  if(!book.has_audiobook)return null;
  const market=locale==='fr'?'FR':locale==='de'?'DE':'US',host=market==='FR'?'www.audible.fr':market==='DE'?'www.audible.de':'www.audible.com';
  const tag=process.env['AUDIBLE_AFFILIATE_'+market]??process.env['NEXT_PUBLIC_AUDIBLE_AFFILIATE_'+market]??'',url=new URL('/search','https://'+host);
  url.searchParams.set('keywords',book.title);if(tag)url.searchParams.set('tag',tag);
  return identifiedLink({name:'Audible',url:url.toString(),isAffiliate:!!tag,isPrimary:false,storeId:null,storeVersion:null,country},'audible-'+market.toLowerCase());
}
