import {createServiceClient} from '@/lib/supabase/server';

export interface WritingProgress {
  total_words:number;
  prompts_completed:number;
  challenges_completed:number;
  workshop_critiques:number;
  writing_streak:number;
  xp:number;
  weekly_words:{week_start:string;words:number}[];
  badges:{badge_id:string;awarded_at:string}[];
}

export async function getWritingProgress(userId:string):Promise<WritingProgress>{
  const {data,error}=await createServiceClient().rpc('writing_progress_snapshot',{p_user_id:userId});
  if(error||!data)throw new Error('Writing progress unavailable');
  return data as WritingProgress;
}
