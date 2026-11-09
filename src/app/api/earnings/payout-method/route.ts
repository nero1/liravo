import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import {verifyAccountPin,PinError} from '@/lib/account-pin';
import { getClientIp,getRequestCorrelationId } from '@/lib/utils';

export const dynamic='force-dynamic';
const schema=z.object({provider:z.enum(['manual','paystack']),display_name:z.string().trim().min(2).max(100),account_number:z.string().trim().min(4).max(80).regex(/^[a-zA-Z0-9 -]+$/),bank_code:z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9-]+$/),currency:z.enum(['USD','NGN','EUR']),pin:z.string().regex(/^\d{4}$/).optional()}).refine(value=>value.provider!=='paystack'||(value.currency==='NGN'&&/^\d{10}$/.test(value.account_number)&&/^\d+$/.test(value.bank_code)));
export async function PUT(request:Request) {
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.get('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  if(!(await checkMoneyRateLimit(user.id,getClientIp(request))).allowed) return NextResponse.json({error:'Too many requests'},{status:429});
  const raw=await request.text();
  if(Buffer.byteLength(raw)>4096) return NextResponse.json({error:'Payload too large'},{status:413});
  let parsed;
  try {parsed=schema.safeParse(JSON.parse(raw));}catch {return NextResponse.json({error:'Invalid JSON'},{status:400});}
  if(!parsed.success) return NextResponse.json({error:'Invalid payout destination'},{status:400});
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');
  if(!key||key.length<8||key.length>200)return NextResponse.json({error:'Missing destination intent'},{status:400});
  let hash:string|null;try{hash=await verifyAccountPin(user.id,parsed.data.pin,request);}catch(error){return NextResponse.json({error:'Confirm your PIN',code:error instanceof PinError?error.code:'PIN_UNAVAILABLE'},{status:error instanceof PinError?error.status:503});}
  const {pin,...destination}=parsed.data;void pin;
  const {error}=await createServiceClient().rpc('save_payout_destination',{p_user_id:user.id,p_key:key,p_data:destination,p_pin_hash:hash,p_correlation_id:getRequestCorrelationId(request)});
  if(error) return NextResponse.json({error:'Payout destination unavailable'},{status:({P1001:409,P1003:403,P1004:422} as Record<string,number>)[error.code]??503});
  return NextResponse.json({saved:true});
}
