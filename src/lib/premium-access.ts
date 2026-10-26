import { createServiceClient } from '@/lib/supabase/server';

export async function hasPremiumAccess(userId: string): Promise<boolean> {
  const {data,error} = await createServiceClient().rpc('has_premium_access' as never,{p_user_id:userId} as never);
  if (error || typeof data !== 'boolean') throw new Error('Premium access verification unavailable');
  return data;
}
