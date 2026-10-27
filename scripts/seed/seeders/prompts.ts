import type {SeedClient} from '../client.js';
import {isDryRun} from '../utils.js';
import {SEED_PROMPTS} from '../data/prompts.js';
import {seedCollection} from '../items.js';

export async function seedPrompts(client:SeedClient){
  if(isDryRun)return {inserted:SEED_PROMPTS.length,skipped:0,errors:[]};
  return seedCollection(client,'prompts');
}
