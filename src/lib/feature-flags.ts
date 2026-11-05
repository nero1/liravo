import {createServiceClient} from '@/lib/supabase/server';
import {getRedisClient,REDIS_KEYS} from '@/lib/redis';
import {FEATURE_FLAGS} from '@/constants/config';

export async function getFeatureFlag(flagName:string):Promise<boolean>{
 try{const{data,error}=await createServiceClient().from('feature_flags').select('enabled').eq('name',flagName).maybeSingle();return!error&&data?.enabled===true;}catch{return false;}
}
export async function getFeatureFlags():Promise<Record<string,boolean>>{
 const defaults=Object.fromEntries(Object.values(FEATURE_FLAGS).map(name=>[name,false]));
 try{const{data,error}=await createServiceClient().from('feature_flags').select('name, enabled');if(error||!Array.isArray(data))return defaults;return{...defaults,...Object.fromEntries(data.map(flag=>[flag.name,flag.enabled===true]))};}catch{return defaults;}
}
export async function invalidateFeatureFlag(flagName:string){
 // Retire cached values used by older deployments; current reads use PostgreSQL.
 try{await getRedisClient().del(REDIS_KEYS.featureFlag(flagName));}catch{}
}
