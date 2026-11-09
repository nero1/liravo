import type {RpcCall}from'@/types/database.generated';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import type {BookChain,BookPassEntry,BookChainNode,BookPassPage,BookPassReceipt} from '@/types/database';
export class BookPassingError extends Error{constructor(message:string,public status:number){super(message);}}
const cursorSchema=z.object({actorId:z.string().uuid(),scope:z.string(),at:z.string().datetime({offset:true}).optional(),id:z.string().uuid().optional(),position:z.number().int().nonnegative().optional()}).strict();
function decode(value:string|null,actorId:string,scope:string){if(!value)return null;try{if(value.length>1000)throw Error();const data=cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString()));if(data.actorId!==actorId||data.scope!==scope)throw Error();return data;}catch{throw new BookPassingError('Invalid cursor',400);}}
async function rpc(...[name,params]:RpcCall){const{data,error}=await createServiceClient().rpc(name,params);if(error||!data)throw new BookPassingError('Book passing unavailable',({P1003:403,P1004:400,P1005:404}as Record<string,number>)[error?.code??'']??503);return data;}
export async function getBookPasses(actorId:string,scope:'chains'|'received'|'sent',raw:string|null=null):Promise<BookPassPage<BookChain|BookPassEntry>>{
 const before=decode(raw,actorId,scope);if(before&&(!before.at||!before.id||before.position!==undefined))throw new BookPassingError('Invalid cursor',400);
 const data=await rpc('book_pass_catalog_snapshot',{p_user:actorId,p_scope:scope,p_at:before?.at??null,p_id:before?.id??null,p_limit:20})as{items:(BookChain|BookPassEntry)[];total:number},items=data.items.slice(0,20),last=items.at(-1);
 return{items,total:data.total,actorId,nextCursor:data.items.length>20&&last?Buffer.from(JSON.stringify({actorId,scope,at:last.created_at,id:last.id})).toString('base64url'):null};
}
export async function getBookChainRoster(actorId:string,chainId:string,raw:string|null=null){
 if(!z.string().uuid().safeParse(chainId).success)throw new BookPassingError('Invalid chain',400);const scope='roster.'+chainId,before=decode(raw,actorId,scope);if(before&&(before.position===undefined||before.at||!before.id))throw new BookPassingError('Invalid cursor',400);
 const data=await rpc('book_chain_roster_snapshot',{p_user:actorId,p_chain:chainId,p_position:before?.position??-1,p_id:before?.id??null,p_limit:20})as{nodes:BookChainNode[];total:number},nodes=data.nodes.slice(0,20),last=nodes.at(-1);
 return{nodes,total:data.total,actorId,chainId,nextCursor:data.nodes.length>20&&last?Buffer.from(JSON.stringify({actorId,scope,position:last.position,id:last.id})).toString('base64url'):null};
}
export async function getBookPassReceipt(actorId:string,action:string,key:string){if(!['book_passes','chain_create','chain_nominate'].includes(action)||key.length<8||key.length>200)throw new BookPassingError('Invalid receipt',400);const data=await rpc('book_pass_receipt_snapshot',{p_user:actorId,p_action:action,p_key:key})as BookPassReceipt;if(data.actorId!==actorId)throw new BookPassingError('Invalid receipt',503);return data;}
