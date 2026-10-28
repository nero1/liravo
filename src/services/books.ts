import {createHash} from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient, REDIS_KEYS, REDIS_TTL } from '@/lib/redis';
import type { BookRow } from '@/types/database';
import { fetchWithRetry } from '@/lib/retry';
import { catalogBookData,clientBook } from '@/lib/catalog-book';

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

export async function searchGoogleBooks(query: string, maxResults = 10): Promise<GoogleBooksVolume[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('printType', 'books');
  if (apiKey) url.searchParams.set('key', apiKey);

  const res = await fetchWithRetry(url.toString(), { next: { revalidate: 3600 } });
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
    published_year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : null,
    description: info.description ?? null,
    cover_url: info.imageLinks?.thumbnail?.replace('http:', 'https:') ?? null,
    page_count: info.pageCount ?? null,
    genres: info.categories ?? [],
    language: info.language ?? 'en',
    isbn_13: isbn13 ?? null,
    isbn_10: isbn10 ?? null,
    average_rating: info.averageRating ?? null,
    ratings_count: info.ratingsCount ?? 0,
  };
}

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  language?: string[];
  first_publish_year?: number;
}

export async function searchOpenLibrary(query: string, maxResults = 10) {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(maxResults));
  url.searchParams.set('fields', 'key,title,author_name,isbn,cover_i,number_of_pages_median,subject,language,first_publish_year');

  try {
    const res = await fetchWithRetry(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.docs ?? []) as OpenLibraryDoc[]).map((doc) => ({
      google_books_id: null as string | null,
      open_library_id: doc.key,
      title: doc.title,
      subtitle: null as string | null,
      author_name: doc.author_name?.[0] ?? 'Unknown',
      author_names: doc.author_name ?? [],
      publisher: null as string | null,
      published_year: doc.first_publish_year ?? null,
      description: null as string | null,
      cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
      page_count: doc.number_of_pages_median ?? null,
      genres: doc.subject?.slice(0, 5) ?? [],
      language: doc.language?.[0] ?? 'en',
      isbn_13: doc.isbn?.find((i) => i.length === 13) ?? null,
      isbn_10: doc.isbn?.find((i) => i.length === 10) ?? null,
      average_rating: null as number | null,
      ratings_count: 0,
    }));
  } catch {
    throw new Error('Open Library search unavailable');
  }
}

export async function searchBooks(query: string, maxResults = 10) {
  const googleVolumes = await searchGoogleBooks(query, maxResults).catch(()=>[]);
  const googleResults = googleVolumes.map((v) => ({ ...googleVolumeToBookData(v), google_books_id: v.id }));
  if (googleResults.length >= 3) return googleResults;
  const olResults = await searchOpenLibrary(query, maxResults).catch(error=>{if(googleResults.length)return [];throw error;});
  return [...googleResults, ...olResults].slice(0, maxResults);
}

export async function storeCatalogBook(value:unknown):Promise<BookRow>{
  const payload=catalogBookData(value);
  const {data,error}=await createServiceClient().rpc('store_catalog_book' as never,{p_data:payload} as never);
  if(error||!data)throw new Error('Book catalog unavailable');
  return clientBook(data as BookRow);
}

export async function getOrCreateBook(googleBooksId:string):Promise<BookRow|null>{
  if(!/^[a-zA-Z0-9_-]{1,200}$/.test(googleBooksId))return null;
  const {data:existing,error}=await createServiceClient().from('books').select('*').eq('google_books_id',googleBooksId).maybeSingle();
  if(error)throw new Error('Book catalog unavailable');
  if(existing)return clientBook(existing);
  const url=new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(googleBooksId)}`);
  if(process.env.GOOGLE_BOOKS_API_KEY)url.searchParams.set('key',process.env.GOOGLE_BOOKS_API_KEY);
  const response=await fetchWithRetry(url.toString());
  const volume:GoogleBooksVolume=await response.json();
  if(volume.id!==googleBooksId)throw new Error('Book identity mismatch');
  return storeCatalogBook(googleVolumeToBookData(volume));
}

export async function getBookById(id:string):Promise<BookRow|null>{
  const redis=getRedisClient();
  const cacheKey=REDIS_KEYS.book(id);
  try{
    const cached=await redis.get(cacheKey);
    if(cached){const book=JSON.parse(cached) as BookRow;if(book.id===id)return clientBook(book);}
  }catch{}
  const {data,error}=await createServiceClient().from('books').select('*').eq('id',id).maybeSingle();
  if(error)throw new Error('Book catalog unavailable');
  if(!data)return null;
  const book=clientBook(data);
  try{await redis.set(cacheKey,JSON.stringify(book),{ex:REDIS_TTL.BOOK});}catch{}
  return book;
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
