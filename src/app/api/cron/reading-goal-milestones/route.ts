import { getRedisClient } from '@/lib/redis';
import { cron } from '@/lib/cron';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic='force-dynamic';
async function run(){
  const db=createServiceClient(),year=new Date().getUTCFullYear();
  const redis=getRedisClient(),cursorKey=`reading-goal-milestones:${year}:cursor`,deadline=Date.now()+40000;
  let after=await redis.get(cursorKey)??undefined,checked=0,milestonesAwarded=0;
  while(checked<400&&Date.now()<deadline){
    let query=db.from('reading_goals').select('user_id').eq('year',year).order('user_id').limit(100);
    if(after)query=query.gt('user_id',after);
    const {data,error}=await query;
    if(error)throw new Error('Reading goals unavailable');
    if(!data?.length){await redis.del(cursorKey);break;}
    for(let index=0;index<data.length;index+=10){
      const results=await Promise.all(data.slice(index,index+10).map(row=>db.rpc('award_reading_goal_milestones' as never,{p_user_id:row.user_id,p_year:year} as never)));
      for(const result of results){if(result.error)throw new Error('Goal milestone unavailable');milestonesAwarded+=Number(result.data);checked++;}
    }
    const next=data[data.length-1].user_id as string;
    after=next;
    await redis.set(cursorKey,next,{ex:7*86400});
  }
  return NextResponse.json({checked,milestonesAwarded});
}
export const GET=cron('reading-goal-milestones',run);
export const POST=GET;
export const maxDuration=60;
