import {directLoginResponse} from '@/lib/auth/second-factor';
import {clientUser} from '@/lib/user-profile';
import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {createServiceClient} from '@/lib/supabase/server';
import {isDirectPostgres} from '@/lib/db/provider';
import {checkCriticalRateLimit} from '@/lib/rate-limit';
import {getClientIp} from '@/lib/utils';
import {getRedisClient} from '@/lib/redis';
import {AuthChallengeError,credentialEmail,credentialPassword,verifyAuthChallenge} from '@/lib/auth/challenges';

export const dynamic='force-dynamic';
const FAILED_ATTEMPTS_TTL=15*60,CAPTCHA_THRESHOLD=3;
const schema=z.object({email:credentialEmail,password:credentialPassword,hcaptchaToken:z.string().max(8192).optional()}).strict();
const dummyHash='$2b$12$9e0BKWDqcma0ywIEdZgZG.SwcEW940wVFsjKKETPzSDZcfk3yxqXa';
export async function POST(request:Request){
  if(!isDirectPostgres())return NextResponse.json({error:'This endpoint is only available in direct PostgreSQL mode'},{status:404});
  const ip=getClientIp(request);if(!(await checkCriticalRateLimit(ip)).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  const raw=await request.text();if(raw.length>16384)return NextResponse.json({error:'Payload too large'},{status:413});
  let body:unknown;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  if(body&&typeof body==='object'&&'password'in body&&typeof body.password==='string'&&Buffer.byteLength(body.password,'utf8')>72)return NextResponse.json({error:'Choose a shorter password',code:'PASSWORD_TOO_LONG'},{status:422});
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid email or password format'},{status:422});
  const {email,password,hcaptchaToken}=parsed.data,identity=createHash('sha256').update(email).digest('hex');
  if(!(await checkCriticalRateLimit('auth:email:'+identity)).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  try{
    const redis=getRedisClient(),keys=['auth:fail:'+ip,'auth:fail:email:'+identity];
    const counts=await Promise.all(keys.map(async key=>{const value=await redis.get(key);if(value!==null&&!/^\d+$/.test(value))throw new Error('Invalid authentication counter');return Number(value??0);}));
    if(process.env.HCAPTCHA_SECRET_KEY&&Math.max(...counts)>=CAPTCHA_THRESHOLD)await verifyAuthChallenge(hcaptchaToken,request);
    const {data,error}=await createServiceClient().rpc('find_direct_account' as never,{p_email:email} as never);if(error)throw new Error('Authentication lookup unavailable');
    const user=data as unknown as {id:string;email:string;password_hash:string|null;deleted_at:string|null}|null;
    const valid=await bcrypt.compare(password,user?.password_hash??dummyHash);
    if(!user||user.deleted_at||!user.password_hash||!valid){
      const failures=await Promise.all(keys.map(key=>redis.incrementWindow(key,FAILED_ATTEMPTS_TTL)));
      return NextResponse.json({error:'Invalid email or password',requireCaptcha:!!process.env.HCAPTCHA_SECRET_KEY&&Math.max(...failures)>=CAPTCHA_THRESHOLD},{status:401});
    }
    await redis.del(keys);return await directLoginResponse(user,clientUser(data),request);
  }catch(error){
    return error instanceof AuthChallengeError?NextResponse.json({error:error.code,code:error.code,requireCaptcha:true},{status:error.status}):NextResponse.json({error:'Authentication unavailable'},{status:503});
  }
}
