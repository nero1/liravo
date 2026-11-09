import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { acknowledgeSubscription, googlePlayTokenId, playEntitlement, type PlaySubscriptionState } from '@/lib/google-play';

export class PurchaseBindingError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export async function reconcileGooglePlayPurchase(userId: string, token: string, state: PlaySubscriptionState, verifiedAt: string, correlationId: string, delivery?: {id:string;fingerprint:string}) {
  const entitlement = playEntitlement(state);
  const tokenId = googlePlayTokenId(token);
  const client = createServiceClient();
  const {data,error} = await client.rpc('reconcile_google_play_purchase',{
    p_user_id:userId,p_token_id:tokenId,p_product_id:entitlement.productId,p_provider_state:entitlement.providerState,
    p_period_end:entitlement.expiresAt,p_account_id:entitlement.accountId,p_linked_token_id:state.linkedPurchaseToken?googlePlayTokenId(state.linkedPurchaseToken):null,
    p_verified_at:verifiedAt,p_acknowledged:state.acknowledgementState==='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',p_correlation_id:correlationId,
    p_delivery_id:delivery?.id??null,p_fingerprint:delivery?.fingerprint??null,
  });
  if (error) {
    const code=({P1001:'BILLING_EVENT_CONFLICT',P1003:'PURCHASE_ACCOUNT_MISMATCH',P1004:'INVALID_PURCHASE_STATE'} as Record<string,string>)[error.code]??'BILLING_DEPENDENCY_FAILURE';
    throw new PurchaseBindingError(error.code==='P1003'?403:error.code==='P1001'?409:error.code==='P1004'?400:503,code);
  }
  const committed=z.object({active:z.boolean(),expiresAt:z.string().nullable(),providerState:z.string(),acknowledged:z.boolean()}).safeParse(data);
  if (!committed.success) throw new PurchaseBindingError(503,'BILLING_STATE_UNAVAILABLE');
  if (committed.data.active && !committed.data.acknowledged) await acknowledgeSubscription(token,state);
  const acknowledged = committed.data.active || committed.data.acknowledged;
  const {error:completionError} = await client.rpc('complete_google_play_delivery',{
    p_user_id:userId,p_token_id:tokenId,p_acknowledged:acknowledged,p_delivery_id:delivery?.id??null,p_fingerprint:delivery?.fingerprint??null,p_correlation_id:correlationId,
  });
  if (completionError) throw new PurchaseBindingError(503,'BILLING_ACKNOWLEDGEMENT_UNAVAILABLE');
  return {...entitlement,...committed.data,acknowledged};
}
