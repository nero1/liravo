import type {RpcCall}from'@/types/database.generated';
import {z} from 'zod';
import {buildAffiliateLinks,type AffiliateLink} from '@/services/books';
import {createServiceClient} from '@/lib/supabase/server';
import type {ReadingList,ReadingListBook,BookRow} from '@/types/database';
const position=z.object({actorId:z.string().uuid().nullable(),scope:z.string(),at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export class ReadingListError extends Error{constructor(message:string,public status:number){super(message);}}
export function decodeListCursor(value:string|null,actorId:string|null,scope:string){if(!value)return null;if(value.length>700)throw new ReadingListError('Invalid cursor',400);try{const cursor=position.parse(JSON.parse(Buffer.from(value,'base64url').toString()));if(cursor.actorId!==actorId||cursor.scope!==scope)throw Error();return cursor;}catch{throw new ReadingListError('Invalid cursor',400);}}
function page<T extends {id:string}>(items:T[],actorId:string|null,scope:string,limit:number,at:(row:T)=>string){const rows=items.slice(0,limit),last=rows.at(-1);return {rows,nextCursor:items.length>limit&&last?Buffer.from(JSON.stringify({actorId,scope,at:at(last),id:last.id})).toString('base64url'):null};}
async function rpc<T>(...[name,args]:RpcCall){const {data,error}=await createServiceClient().rpc(name,args);if(error||!data)throw new ReadingListError('List unavailable',({P1003:403,P1004:400,P1005:404} as Record<string,number>)[error?.code??'']??503);return data as T;}
export async function getReadingLists(actorId:string,scope:'mine'|'followed',cursor:string|null=null){const before=decodeListCursor(cursor,actorId,scope),data=await rpc<{lists:ReadingList[]}>('reading_list_catalog_snapshot',{p_user:actorId,p_scope:scope,p_at:before?.at??null,p_id:before?.id??null,p_limit:50}),result=page(data.lists,actorId,scope,50,row=>row.created_at);return {lists:result.rows,nextCursor:result.nextCursor,actorId};}
export async function getReadingList(actorId:string|null,listId:string,cursor:string|null=null){const scope='books.'+listId,before=decodeListCursor(cursor,actorId,scope),data=await rpc<{list:ReadingList;books:ReadingListBook[]}>('reading_list_detail_snapshot',{p_user:actorId,p_list:listId,p_at:before?.at??null,p_id:before?.id??null,p_limit:20}),result=page(data.books,actorId,scope,20,row=>row.added_at);return {...data,books:result.rows,nextCursor:result.nextCursor,actorId,bulkSearchUrl:await getBulkBookSearch(actorId,data.list.book_count,result.rows)};}
export async function mutateReadingList(actorId:string,listId:string,action:'update'|'delete'|'add'|'remove',payload:Record<string,unknown>={}){return {...await rpc<{list?:ReadingList;bookId?:string;deleted?:boolean}>('mutate_reading_list',{p_user:actorId,p_list:listId,p_action:action,p_payload:z.json().parse(payload)}),actorId,listId};}
export function listError(error:unknown){return {error:'List unavailable',status:error instanceof ReadingListError?error.status:503};}

export function bulkListSearchLink(books:Pick<ReadingListBook,'isbn_13'>[],total:number,links:AffiliateLink[]){
  if(!total||total>10||books.length!==total||books.some(book=>!book.isbn_13))return null;
  for(const link of links){const url=new URL(link.url);if(url.protocol==='https:'&&/^www\.amazon\.(com|co\.uk|ca|com\.au|fr|de)$/.test(url.hostname)&&url.pathname==='/s'&&url.searchParams.has('k')&&link.storeId){url.searchParams.set('k',books.map(book=>book.isbn_13).join(' '));return url.toString();}}
  return null;
}
export async function getBulkBookSearch(actorId:string|null,total:number,books:Pick<BookRow,'title'|'isbn_13'|'isbn_10'>[]){
  if(!total||total>10||books.length!==total||books.some(book=>!book.isbn_13))return null;
  const db=createServiceClient();let country:string|undefined,locale='en';
  if(actorId){const {data,error}=await db.from('users').select('country,preferred_locale').eq('id',actorId).single();if(error||!data)throw new ReadingListError('List stores unavailable',503);country=data.country??undefined;locale=data.preferred_locale;}
  return bulkListSearchLink(books,total,await buildAffiliateLinks(books[0],country,locale));
}
