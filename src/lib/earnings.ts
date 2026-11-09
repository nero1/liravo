import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';

export const PAYOUT_CURRENCIES=['USD','NGN','EUR'] as const;
const amount=z.string().regex(/^-?\d+(\.\d+)?$/);
const balance=z.object({currency:z.enum(PAYOUT_CURRENCIES),tips:amount,referrals:amount,events:amount,earned:amount,reserved:amount,paid:amount,available:amount});
export type CreatorBalance=z.infer<typeof balance>;
export async function getCreatorBalance(userId:string,currency:typeof PAYOUT_CURRENCIES[number]):Promise<CreatorBalance> {
  const {data,error}=await createServiceClient().rpc('creator_balance',{p_user_id:userId,p_currency:currency});
  const parsed=balance.safeParse(data);
  if(error || !parsed.success) throw new Error('Earnings unavailable');
  return parsed.data;
}
