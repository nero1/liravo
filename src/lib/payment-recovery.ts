import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';

const rows=z.array(z.object({currency:z.enum(['USD','NGN','EUR']),charged_minor:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),refunded_minor:z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),count:z.number().int().positive()})).refine(values=>values.every(row=>row.refunded_minor<=row.charged_minor));
export type PaymentRecovery=z.infer<typeof rows>[number];
export async function readPaymentRecovery(userId:string,kind:'tip'|'subscription'|'ticket',entityId?:string){
  const {data,error}=await createServiceClient().rpc('read_payment_recovery',{p_user_id:userId,p_kind:kind,p_entity_id:entityId??null});
  if(error)throw new Error('Payment recovery unavailable');
  return rows.parse(data);
}
