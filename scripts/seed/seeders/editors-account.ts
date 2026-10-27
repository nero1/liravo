import type {SeedClient} from '../client.js';
import {isDryRun} from '../utils.js';
import {seedItem} from '../items.js';

export const EDITORS_ID_DO='00000000-0000-4000-a000-000000000001';
export async function seedEditorsAccount(client:SeedClient){
  if(isDryRun)return {inserted:1,skipped:0,errors:[],editorsId:EDITORS_ID_DO};
  const result=await seedItem(client,'editors','system',{});
  return {inserted:result.created?1:0,skipped:result.created?0:1,errors:[],editorsId:result.id};
}
export async function getEditorsId(client:SeedClient){
  const {data,error}=await client.from('users').select('id').eq('username','liravo_editors').maybeSingle();
  if(error)throw new Error(error.message);return data?.id??null;
}
