import type {RpcFunctions}from'@/types/database.generated';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {getRedisClient} from '@/lib/redis';
const book=z.object({id:z.string().uuid(),title:z.string(),author_name:z.string(),cover_url:z.string().nullable()}),ranked=z.object({book_id:z.string().uuid(),work_id:z.string().uuid(),count:z.number().int().nonnegative(),book:book.extend({language:z.string(),format:z.string().nullable()})});
const gem=book.extend({work_id:z.string().uuid(),average_rating:z.number().min(1).max(5),have_read_count:z.number().int().nonnegative(),rating_source:z.enum(['community','catalog'])});
const overlap=z.object({signature:z.string().regex(/^[a-f0-9]{32}$/),cohort:z.array(z.string().uuid()).max(20),books:z.array(book).max(10)});
const cacheSchema=z.object({version:z.literal(2),actorId:z.string().uuid(),signature:z.string().regex(/^[a-f0-9]{32}$/),cohort:z.array(z.string().uuid()).max(20).refine(value=>new Set(value).size===value.length)}).strict();
export const recommendationCursor=z.object({at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export type DiscoveryBook=z.infer<typeof book>;
export type RankedDiscoveryBook=z.infer<typeof ranked>;
export type DiscoveryGem=z.infer<typeof gem>;
export class DiscoveryError extends Error{constructor(message:string,public status:number){super(message);}}
async function read<T,N extends keyof RpcFunctions>(name:N,args:RpcFunctions[N]['Args'],schema:z.ZodType<T>):Promise<T>{const{data,error}=await createServiceClient().rpc(name,args),parsed=schema.safeParse(data);if(error||!parsed.success)throw new DiscoveryError('Discovery unavailable',({P1003:403,P1004:400,P1005:404}as Record<string,number>)[error?.code??'']??503);return parsed.data;}
export const getTrendingBooks=(country:string|null=null)=>read('discovery_trending_snapshot',{p_country:country,p_limit:10},z.array(ranked).max(10));
export const getHiddenGems=()=>read('discovery_gems_snapshot',{p_limit:10},z.array(gem).max(10));
export const getFriendRecommendations=(actorId:string)=>read('discovery_friends_snapshot',{p_user:actorId,p_limit:10},z.array(ranked).max(10));
export const getFollowedAuthorBooks=(actorId:string)=>read('followed_author_books',{p_user:actorId},z.array(book).max(10));
export async function getShelfOverlapBooks(actorId:string,options:{refresh?:boolean;requireCache?:boolean}={}){
 const key='recommendations:v2:cohort:'+actorId;let cache:z.infer<typeof cacheSchema>|null=null;
 if(!options.refresh)try{const raw=await getRedisClient().get(key);if(raw){const parsed=cacheSchema.safeParse(JSON.parse(raw));if(parsed.success&&parsed.data.actorId===actorId)cache=parsed.data;}}catch{}
 let result=await read('shelf_overlap_snapshot',{p_user:actorId,p_cohort:cache?.cohort??null},overlap),fresh=!cache;
 if(cache&&(cache.signature!==result.signature||cache.cohort.length!==result.cohort.length)){result=await read('shelf_overlap_snapshot',{p_user:actorId,p_cohort:null},overlap);fresh=true;}
 if(fresh)try{const saved=await getRedisClient().set(key,JSON.stringify({version:2,actorId,signature:result.signature,cohort:result.cohort}),{ex:86400});if(options.requireCache&&!saved)throw Error('Recommendation cache unavailable');}catch(error){if(options.requireCache)throw error;}
 return result.books;
}
export const getRecommendationReaders=(cursor:z.infer<typeof recommendationCursor>|null)=>read('recommendation_reader_page',{p_at:cursor?.at??null,p_id:cursor?.id??null,p_limit:40},z.array(z.object({id:z.string().uuid(),created_at:z.string().datetime({offset:true})})).max(41));
