import {createHash} from 'node:crypto';
import type {SeedClient} from './client';
import {catalogBookData} from '../../src/lib/catalog-book';
import type {SeedResult} from './utils';
import {SEED_BOOKS} from './data/books';
import {SEED_READING_LISTS} from './data/reading-lists';
import {SEED_CHALLENGES} from './data/challenges';
import {SEED_PROMPTS} from './data/prompts';

export type SeedKind='editors'|'books'|'lists'|'challenges'|'prompts'|'reviews'|'quotes';
export async function seedItem(client:SeedClient,kind:SeedKind,key:string,data:Record<string,unknown>,actorId?:string){
  const request=client.rpc('seed_content_item',{p_kind:kind,p_key:key,p_data:data,p_actor_id:actorId??null});
  const {data:result,error}=await (typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(6000)):request);
  if(error)throw new Error(error.message);
  if(!result||typeof result.id!=='string'||typeof result.created!=='boolean'||typeof result.repaired!=='boolean')throw new Error('Seed result unavailable');
  return result as {id:string;created:boolean;repaired:boolean};
}
export const seedKey=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function seedCollection(client:SeedClient,kind:'books'|'lists'|'challenges'|'prompts',actorId?:string){
  const items=kind==='books'?SEED_BOOKS.map(book=>({key:book.isbn_13,data:{...catalogBookData(book),has_audiobook:book.has_audiobook}})):
    kind==='lists'?SEED_READING_LISTS.map(list=>({key:seedKey(list.title),data:{title:list.title,description:list.description,book_isbns:list.book_isbn_13s}})):
    kind==='challenges'?SEED_CHALLENGES.map(challenge=>({key:seedKey(challenge.title),data:{...challenge}})):
    SEED_PROMPTS.map((prompt,index)=>({key:'launch-v1:'+index,data:{prompt_text:prompt.prompt_text,topic_seed:prompt.topic_seed,offset:index}}));
  const result:SeedResult&{repaired:number;pending:number;ids:Record<string,string>}={inserted:0,skipped:0,repaired:0,pending:0,errors:[],ids:{}};
  const deadline=Date.now()+35000;
  for(const [index,item] of items.entries()){
    if(Date.now()>=deadline){result.pending=items.length-index;result.errors.push('Seed budget exhausted; retry to finish');break;}
    try{const saved=await seedItem(client,kind,item.key,item.data,actorId);result.ids[item.key]=saved.id;if(saved.created)result.inserted++;else result.skipped++;if(saved.repaired)result.repaired++;}
    catch(error){result.errors.push(error instanceof Error?error.message:'Seed unavailable');}
  }
  return result;
}
