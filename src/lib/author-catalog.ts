import {createServiceClient} from '@/lib/supabase/server';
import {decodeCursor,encodeCursor} from '@/lib/pagination';
import {bookRating} from '@/lib/catalog-book';

export interface AuthorBook {
  id:string;work_id:string;title:string;author_name:string;cover_url:string|null;isbn_13:string|null;isbn_10:string|null;
  language:string;format:string|null;published_year:number|null;created_at:string;average_rating:number|null;ratings_count:number;
  currently_reading_count:number;want_to_read_count:number;have_read_count:number;
}
export interface CatalogAuthor {id:string;username:string;display_name:string;avatar_url:string|null;is_verified_author:boolean;}
export interface AuthorAnalytics {
  totalWantToReads:number;totalCurrentlyReading:number;totalHaveRead:number;totalReviews:number;followerCount:number;
  recentReviews:{id:string;rating:number;content:string|null;created_at:string;books:{title:string};users:{display_name:string;username:string}}[];
}
export async function getAuthorCatalog(authorId:string,cursor:string|null=null){
  const before=decodeCursor(cursor),limit=30;
  const {data,error}=await createServiceClient().rpc('author_catalog_snapshot',{p_author:authorId,p_before:before?.at??null,p_id:before?.id??null,p_limit:limit});
  if(error||!data)throw new Error('Author catalog unavailable');
  const snapshot=data as {books:AuthorBook[];total:number},books=snapshot.books.slice(0,limit).map(book=>({...book,average_rating:bookRating(book.average_rating)})),last=books.at(-1);
  return {books,total:snapshot.total,nextCursor:snapshot.books.length>limit&&last?encodeCursor({at:last.created_at,id:last.id}):null};
}
export async function getBookAuthors(bookId:string):Promise<CatalogAuthor[]>{
  const {data,error}=await createServiceClient().rpc('book_authors_snapshot',{p_book:bookId});
  if(error||!Array.isArray(data))throw new Error('Book authors unavailable');return data as CatalogAuthor[];
}
export async function getAuthorAnalytics(authorId:string):Promise<AuthorAnalytics|null>{
  const {data,error}=await createServiceClient().rpc('author_analytics_snapshot',{p_author:authorId});
  if(error)throw new Error('Author analytics unavailable');return data as AuthorAnalytics|null;
}
