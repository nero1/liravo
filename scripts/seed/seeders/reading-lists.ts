import type {SeedClient} from '../client.js';
import {isDryRun} from '../utils.js';
import {SEED_READING_LISTS} from '../data/reading-lists.js';
import {seedCollection} from '../items.js';

export async function seedReadingLists(client:SeedClient,_editorsId?:string,_bookIdsByIsbn?:Map<string,string>){
  if(isDryRun)return {inserted:SEED_READING_LISTS.length,skipped:0,errors:[]};
  return seedCollection(client,'lists');
}
