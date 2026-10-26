import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createServiceClient } from '@/lib/supabase/server';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';

export const dynamic='force-dynamic';
const schema=z.object({provider:z.enum(['manual','paystack']),display_name:z.string().trim().min(2).max(100),account_number:z.string().trim().min(4).max(80).regex(/^[a-zA-Z0-9 -]+$/),bank_code:z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9-]+$/),currency:z.enum(['USD','NGN','EUR'])}).refine(value=>value.provider!=='paystack'||(value.currency==='NGN'&&/^\d{10}$/.test(value.account_number)&&/^\d+$/.test(value.bank_code)));
export async function PUT(request:Request) {
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!(await checkMoneyRateLimit(user.id,getClientIp(request))).allowed) return NextResponse.json({error:'Too many requests'},{status:429});
  const raw=await request.text();
  if(Buffer.byteLength(raw)>4096) return NextResponse.json({error:'Payload too large'},{status:413});
  let parsed;
  try {parsed=schema.safeParse(JSON.parse(raw));}catch {return NextResponse.json({error:'Invalid JSON'},{status:400});}
  if(!parsed.success) return NextResponse.json({error:'Invalid payout destination'},{status:400});
  const {error}=await createServiceClient().from('user_payout_methods').upsert({...parsed.data,user_id:user.id,paystack_recipient_code:null},{onConflict:'user_id,provider'});
  if(error) return NextResponse.json({error:'Payout destination unavailable'},{status:503});
  return NextResponse.json({saved:true});
}
