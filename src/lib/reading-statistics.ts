import {createServiceClient} from '@/lib/supabase/server';
import {getLevelTitle} from '@/services/xp';
import {LEVEL_THRESHOLDS} from '@/constants/config';
import type {ReadingStatsRow,WrappedData,PublicReadingYear} from '@/types/database';
export async function getReadingYear(userId:string,year=new Date().getUTCFullYear()){
  const {data,error}=await createServiceClient().rpc('reading_year_snapshot' as never,{p_user:userId,p_year:year} as never);
  if(error)throw Error('Reading statistics unavailable');if(!data)return null;
  const snapshot=data as {stats:ReadingStatsRow;wrapped:WrappedData},xp=snapshot.wrapped.totalXp,level=LEVEL_THRESHOLDS.find(level=>xp>=level.min&&xp<=level.max)??LEVEL_THRESHOLDS[7];
  return {...snapshot,wrapped:{...snapshot.wrapped,readerTitle:getLevelTitle(xp),readerLevel:level.min,mostActiveMonth:snapshot.wrapped.mostActiveMonthNumber?new Intl.DateTimeFormat('en',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(year,snapshot.wrapped.mostActiveMonthNumber-1,1))):null}};
}
export async function getPublicReadingYear(userId:string,year=new Date().getUTCFullYear()):Promise<PublicReadingYear|null>{
  const {data,error}=await createServiceClient().rpc('public_reading_year_snapshot' as never,{p_user:userId,p_year:year} as never);if(error)throw Error('Public reading summary unavailable');return data as PublicReadingYear|null;
}
