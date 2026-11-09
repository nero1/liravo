import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';

const count=z.number().int().nonnegative(),money=z.number().finite();
const analyticsSchema=z.object({follower_count:count,review_count:count,want_to_read_triggered:count,tips_received:money,tips_received_by_currency:z.object({USD:money,NGN:money,EUR:money})});
const leaderboardSchema=z.object({week_start:z.string(),leaderboard:z.array(z.object({user_id:z.string().uuid(),username:z.string(),display_name:z.string().nullable(),avatar_url:z.string().nullable(),user_types:z.array(z.string()),is_verified_author:z.boolean(),want_to_read_score:count,total_score:count})).max(50)});
export type CreatorAnalytics=z.infer<typeof analyticsSchema>;
export type CreatorLeaderboard=z.infer<typeof leaderboardSchema>;
export async function getCreatorAnalytics(userId:string):Promise<CreatorAnalytics>{
  const {data,error}=await createServiceClient().rpc('read_creator_analytics',{p_user_id:userId}),parsed=analyticsSchema.safeParse(data);
  if(error||!parsed.success)throw new Error('Creator analytics unavailable');return parsed.data;
}
export async function getCreatorLeaderboard():Promise<CreatorLeaderboard>{
  const {data,error}=await createServiceClient().rpc('read_creator_leaderboard'),parsed=leaderboardSchema.safeParse(data);
  if(error||!parsed.success)throw new Error('Creator leaderboard unavailable');return parsed.data;
}
