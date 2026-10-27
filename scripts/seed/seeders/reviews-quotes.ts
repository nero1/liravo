import type {SeedClient} from '../client.js';
import type {SeedResult} from '../utils.js';
import {isDryRun} from '../utils.js';
import {SEED_REVIEWS,SEED_QUOTES} from '../data/reviews-quotes.js';
import {seedItem,seedKey} from '../items.js';

export async function seedReviewsAndQuotes(client:SeedClient,_editorsId:string,bookIdsByIsbn:Map<string,string>):Promise<SeedResult>{
  if(isDryRun)return {inserted:SEED_REVIEWS.length+SEED_QUOTES.length,skipped:0,errors:[]};
  const result:SeedResult={inserted:0,skipped:0,errors:[]};
  for(const [kind,items] of [['reviews',SEED_REVIEWS],['quotes',SEED_QUOTES]] as const){
    for(const item of items){
      try{
        const bookId=bookIdsByIsbn.get(item.book_isbn_13);if(!bookId)throw new Error('Seed book unavailable: '+item.book_isbn_13);
        const saved=await seedItem(client,kind,seedKey(item.book_isbn_13+':'+(kind==='quotes'?item.content:'review')),{...item,book_id:bookId});
        if(saved.created)result.inserted++;else result.skipped++;
      }catch(error){result.errors.push(error instanceof Error?error.message:'Seed unavailable');}
    }
  }
  return result;
}
