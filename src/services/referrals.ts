import {createServiceClient} from '@/lib/supabase/server';
export interface ReferralStatistics {
  referralCode:string|null;
  referralCount:number;
  xpFromReferrals:number;
  earnedByCurrency:Record<string,string>;
  milestones:{id:string;labelKey:string;target:number;xp:number;earned:boolean}[];
  topReferrers:{id:string;username:string;display_name:string;count:number}[];
}
export async function getReferralStatistics(userId:string):Promise<ReferralStatistics>{
  const {data,error}=await createServiceClient().rpc('referral_statistics' as never,{p_user_id:userId} as never);
  if(error||!data)throw new Error('Referral statistics unavailable');
  return data as ReferralStatistics;
}
