import {createServiceClient} from '@/lib/supabase/server';
import {LEVEL_THRESHOLDS} from '@/constants/config';
import type {LeaderboardPage,LeaderboardType,LeaderboardPeriod} from '@/types/database';
export class LeaderboardError extends Error{constructor(message:string,public status:number){super(message);}}
export async function getLeaderboard(actorId:string|null,type:LeaderboardType='global',period:LeaderboardPeriod='weekly',country:string|null=null,limit=50){
  const {data,error}=await createServiceClient().rpc('leaderboard_snapshot' as never,{p_user:actorId,p_type:type,p_period:period,p_country:country,p_limit:limit} as never);
  if(error||!data)throw new LeaderboardError('Leaderboard unavailable',({P1003:403,P1004:400} as Record<string,number>)[error?.code??'']??503);
  const page=data as LeaderboardPage;return {...page,actorId,limit,leaderboard:page.leaderboard.map(entry=>{const level=LEVEL_THRESHOLDS.find(level=>entry.lifetime_xp>=level.min&&entry.lifetime_xp<=level.max)??LEVEL_THRESHOLDS[0];return {...entry,level_min:level.min,level_title:level.title};})};
}
