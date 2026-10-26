import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';
import { getRequestCorrelationId } from '@/lib/utils';

export async function DELETE(request:Request,{params}:{params:{id:string}}) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid payout'},{status:400});
  const {error}=await createServiceClient().rpc('cancel_payout_request' as never,{p_user_id:user.id,p_payout_id:params.id,p_correlation_id:getRequestCorrelationId(request)} as never);
  if(error)return NextResponse.json({error:'Payout cannot be cancelled'},{status:error.code==='P1005'?404:error.code==='P1001'?409:503});
  return NextResponse.json({cancelled:true});
}
