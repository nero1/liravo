import {cron} from '@/lib/cron';
import {NextResponse} from 'next/server';
import {getRedisClient} from '@/lib/redis';
import {getRecommendationReaders,getShelfOverlapBooks,recommendationCursor} from '@/lib/discovery';
export const dynamic='force-dynamic';
const CURSOR='cron:shelf-recommendations:v2:cursor';
async function run(){
 const deadline=Date.now()+35000,redis=getRedisClient(),raw=await redis.get(CURSOR);let cursor=raw?recommendationCursor.parse(JSON.parse(raw)):null,processed=0;
 while(Date.now()<deadline){
  const rows=await getRecommendationReaders(cursor),page=rows.slice(0,40);
  if(!page.length){await redis.del(CURSOR);return NextResponse.json({processed,incomplete:false});}
  for(let index=0;index<page.length;index+=4){
   if(Date.now()>=deadline)return NextResponse.json({processed,incomplete:true});
   const batch=page.slice(index,index+4),results=await Promise.allSettled(batch.map(reader=>getShelfOverlapBooks(reader.id,{refresh:true,requireCache:true})));if(results.some(result=>result.status==='rejected'))throw Error('Recommendation refresh unavailable');
   const last=batch.at(-1)!;cursor={at:last.created_at,id:last.id};if(!await redis.set(CURSOR,JSON.stringify(cursor)))throw Error('Recommendation checkpoint unavailable');processed+=batch.length;
  }
  if(rows.length<=40){await redis.del(CURSOR);return NextResponse.json({processed,incomplete:false});}
 }
 return NextResponse.json({processed,incomplete:true});
}
export const GET=cron('shelf-recommendations',run);
export const POST=GET;
export const maxDuration=60;
