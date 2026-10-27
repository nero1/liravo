import type {SeedClient} from '../client.js';
import {isDryRun} from '../utils.js';
import {SEED_BOOKS} from '../data/books.js';
import {seedCollection} from '../items.js';

export async function seedBooks(client:SeedClient){
  if(isDryRun)return {inserted:SEED_BOOKS.length,skipped:0,errors:[],bookIdsByIsbn:new Map<string,string>()};
  const result=await seedCollection(client,'books');
  return {...result,bookIdsByIsbn:new Map(Object.entries(result.ids))};
}
