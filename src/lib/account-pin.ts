import bcrypt from 'bcryptjs';
import {createServiceClient} from '@/lib/supabase/server';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {getClientIp} from '@/lib/utils';

export class PinError extends Error{
  constructor(public readonly code:string,public readonly status:number){super(code);}
}
export async function checkPinRate(userId:string,request:Request){
  if(!(await checkCriticalRateLimit('pin:user:'+userId)).allowed)throw new PinError('PIN_RATE_LIMIT',429);
  const ip=getClientIp(request);if(ip!=='unknown'&&!(await checkCriticalRateLimit('pin:ip:'+ip)).allowed)throw new PinError('PIN_RATE_LIMIT',429);
}
export async function readAccountPin(userId:string){
  const {data,error}=await createServiceClient().from('users').select('pin_hash,is_banned,deleted_at').eq('id',userId).maybeSingle();
  if(error)throw new PinError('PIN_UNAVAILABLE',503);
  if(!data||data.is_banned||data.deleted_at)throw new PinError('ACCOUNT_UNAVAILABLE',403);
  if(data.pin_hash!==null&&typeof data.pin_hash!=='string')throw new PinError('PIN_UNAVAILABLE',503);
  return data.pin_hash;
}
export async function verifyAccountPin(userId:string,pin:string|undefined,request:Request){
  await checkPinRate(userId,request);
  const hash=await readAccountPin(userId);
  if(hash){if(!pin)throw new PinError('PIN_REQUIRED',403);if(!/^\d{4}$/.test(pin)||!await bcrypt.compare(pin,hash))throw new PinError('PIN_INVALID',403);}
  return hash;
}
