import type {SeedClient} from '../client.js';
import {isDryRun} from '../utils.js';
import {SEED_CHALLENGES} from '../data/challenges.js';
import {seedCollection} from '../items.js';

export async function seedChallenges(client:SeedClient){
  if(isDryRun)return {inserted:SEED_CHALLENGES.length,skipped:0,errors:[]};
  return seedCollection(client,'challenges');
}
