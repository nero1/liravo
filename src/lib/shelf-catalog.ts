import type {RpcCall}from'@/types/database.generated';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import type {ShelfRow,ShelfBookRow,BookRow,ReadingGoalData} from '@/types/database';
export type CatalogShelf=ShelfRow&{book_count:number;contains_book:boolean};
export type ShelfEdition=ShelfBookRow&{source_book_id:string;book:BookRow};
export class ShelfError extends Error{constructor(message:string,public status:number){super(message);}}
const position=z.object({actorId:z.string().uuid(),scope:z.string(),at:z.string().datetime({offset:true}),id:z.string().uuid(),isDefault:z.boolean().optional()}).strict();
function cursor(value:string|null,actorId:string,scope:string){if(!value)return null;try{if(value.length>1000)throw Error();const parsed=position.parse(JSON.parse(Buffer.from(value,'base64url').toString()));if(parsed.actorId!==actorId||parsed.scope!==scope)throw Error();return parsed;}catch{throw new ShelfError('Invalid shelf cursor',400);}}
const encode=(value:z.infer<typeof position>)=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function rpc<T>(...[name,body]:RpcCall):Promise<T>{const{data,error}=await createServiceClient().rpc(name,body);if(error||!data)throw new ShelfError('Shelf unavailable',({P1003:403,P1004:400,P1005:404}as Record<string,number>)[error?.code??'']??503);return data as T;}
export async function getShelfCatalog(actorId:string,bookId:string|null=null,raw:string|null=null,limit=50){
 if(bookId&&!z.string().uuid().safeParse(bookId).success||!Number.isInteger(limit)||limit<1||limit>100)throw new ShelfError('Invalid shelf query',400);
 const scope='catalog.'+(bookId??''),before=cursor(raw,actorId,scope);if(before&&typeof before.isDefault!=='boolean')throw new ShelfError('Invalid shelf cursor',400);
 const result=await rpc<{shelves:CatalogShelf[];total:number;selectedTotal:number;reading:Omit<ReadingGoalData,'actorId'>}>('shelf_catalog_snapshot',{p_user:actorId,p_book:bookId,p_default:before?.isDefault??null,p_at:before?.at??null,p_id:before?.id??null,p_limit:limit,p_year:new Date().getUTCFullYear()}),shelves=result.shelves.slice(0,limit),last=shelves.at(-1);
 return{...result,shelves,bookId,addedToShelves:shelves.filter(shelf=>shelf.contains_book).map(shelf=>shelf.id),actorId,nextCursor:result.shelves.length>limit&&last?encode({actorId,scope,at:last.created_at,id:last.id,isDefault:last.is_default}):null};
}
export async function getShelfDetail(actorId:string,shelfId:string,raw:string|null=null,limit=50){
 if(!z.string().uuid().safeParse(shelfId).success||!Number.isInteger(limit)||limit<1||limit>100)throw new ShelfError('Invalid shelf query',400);
 const scope='books.'+shelfId,before=cursor(raw,actorId,scope);if(before?.isDefault!==undefined)throw new ShelfError('Invalid shelf cursor',400);
 const result=await rpc<{shelf:CatalogShelf;total:number;books:{entry:ShelfEdition;at:string;id:string}[]}>('shelf_detail_snapshot',{p_user:actorId,p_shelf:shelfId,p_at:before?.at??null,p_id:before?.id??null,p_limit:limit}),rows=result.books.slice(0,limit),last=rows.at(-1);
 return{...result,books:rows.map(row=>row.entry),actorId,shelfId,nextCursor:result.books.length>limit&&last?encode({actorId,scope,at:last.at,id:last.id}):null};
}
export async function getShelfForSlug(actorId:string,slug:string){const{data,error}=await createServiceClient().from('shelves').select('id,name,default_type').eq('user_id',actorId).eq('slug',slug).maybeSingle();if(error)throw new ShelfError('Shelf unavailable',503);if(!data)throw new ShelfError('Shelf unavailable',404);return data as Pick<ShelfRow,'id'|'name'|'default_type'>;}
