import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { AIProfileError,generateTasteProfile,generateWritingPlan,writingWeekStart } from '@/services/ai-profiles';

export async function refreshAIProfiles(kind:'taste'|'writing'){
  const db=createServiceClient(),redis=getRedisClient(),deadline=Date.now()+35000;
  const cursorKey=`ai-profiles:v1:${kind}:${kind==='writing'?writingWeekStart():'current'}:cursor`;
  let after=await redis.get(cursorKey)??undefined;
  const counts={processed:0,generated:0,skipped:0,errors:0};
  while(counts.processed<400&&Date.now()<deadline){
    let query=db.from('users').select('id,user_types').eq('is_banned',false).is('deleted_at',null).order('id').limit(20);
    if(after)query=query.gt('id',after);
    const {data,error}=await query;
    if(error)throw new Error('AI profile candidates unavailable');
    if(!data?.length){await redis.del(cursorKey);break;}
    for(let index=0;index<data.length&&Date.now()<deadline;index+=2){
      const batch=data.slice(index,index+2);
      await Promise.all(batch.map(async user=>{
        counts.processed++;
        if(kind==='writing'&&!(user.user_types??[]).includes('newbie_writer')){counts.skipped++;return;}
        try{
          const result=await (kind==='taste'?generateTasteProfile(user.id):generateWritingPlan(user.id));
          if(result.cached)counts.skipped++;else counts.generated++;
        }catch(error){
          if(error instanceof AIProfileError&&['premiumRequired','insufficientHistory','busy','writerRequired'].includes(error.code))counts.skipped++;
          else counts.errors++;
        }
      }));
      after=batch[batch.length-1].id;
      await redis.set(cursorKey,after as string,{ex:7*86400});
    }
  }
  return NextResponse.json(counts);
}
