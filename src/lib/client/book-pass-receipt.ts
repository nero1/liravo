import type {BookPassReceipt} from '@/types/database';
export type PassAction='book_passes'|'chain_create'|'chain_nominate';
export function validBookPassReceipt(data:BookPassReceipt,actorId:string,action:PassAction,chainId?:string,body?:Record<string,unknown>){
 if(data?.actorId!==actorId)return false;
 if(action==='book_passes')return !!data.pass?.id&&data.pass.sender_id===actorId&&(!body||data.pass.book_id===body.book_id&&data.pass.recipient_id===body.recipient_id&&data.pass.message===(body.message??null));
 if(action==='chain_create')return !!data.chain?.id&&data.chainId===data.chain.id&&data.chain.creator_id===actorId&&data.bookId===data.chain.book_id&&(!body||data.bookId===body.book_id);
 return data.success===true&&data.chainId===chainId&&!!data.nomineeId&&Number.isInteger(data.position)&&(!body||data.nomineeId===body.nominee_id);
}
