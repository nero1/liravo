import {NextResponse} from 'next/server';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {checkPinRate,readAccountPin,verifyAccountPin,PinError} from '@/lib/account-pin';

export const dynamic='force-dynamic';
const pin=z.string().regex(/^\d{4}$/);
const failure=(error:unknown)=>NextResponse.json({error:error instanceof PinError?error.code:'PIN_UNAVAILABLE',code:error instanceof PinError?error.code:'PIN_UNAVAILABLE'},{status:error instanceof PinError?error.status:503});
export async function GET(){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json({configured:!!await readAccountPin(user.id)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}
}
export async function POST(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.get('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  const parsed=z.object({pin,currentPin:pin.optional()}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid PIN format',code:'PIN_FORMAT'},{status:422});
  try{
    await checkPinRate(user.id,request);const current=await readAccountPin(user.id);let next=current;
    const unchanged=current&&await bcrypt.compare(parsed.data.pin,current);
    if(!unchanged){
      if(current&&(!parsed.data.currentPin||!await bcrypt.compare(parsed.data.currentPin,current)))throw new PinError('PIN_INVALID',403);
      next=await bcrypt.hash(parsed.data.pin,12);
    }
    const {error}=await createServiceClient().rpc('set_account_pin',{p_user_id:user.id,p_expected_hash:current,p_new_hash:next});
    if(error)throw new PinError(error.code==='P1001'?'PIN_CHANGED':error.code==='P1003'?'ACCOUNT_UNAVAILABLE':'PIN_UNAVAILABLE',({P1001:409,P1003:403,P1004:422} as Record<string,number>)[error.code]??503);
    return NextResponse.json({success:true,configured:true});
  }catch(error){return failure(error);}
}
export async function PUT(request:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.get('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'Account changed',code:'ACCOUNT_CHANGED'},{status:409});
  const parsed=z.object({pin}).strict().safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid PIN format',code:'PIN_FORMAT'},{status:422});
  try{const hash=await verifyAccountPin(user.id,parsed.data.pin,request);if(!hash)throw new PinError('PIN_NOT_SET',404);return NextResponse.json({verified:true});}catch(error){return failure(error);}
}
