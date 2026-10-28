import {accountLocale} from '@/lib/auth/locale';
import {AuthChallengeError,credentialEmail,credentialPassword,verifyAuthChallenge} from '@/lib/auth/challenges';
import { isStatelessNativeAuth } from '@/lib/csrf';
import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { createDoSession, SESSION_COOKIE, SESSION_TTL } from '@/lib/db/unified-client';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: credentialEmail,
  password: credentialPassword.refine(value=>value.length>=8),
  hcaptchaToken: z.string().max(8192).optional(),
});

export async function POST(request: Request) {
  if (!isDirectPostgres()) {
    return NextResponse.json({ error: 'This endpoint is only available in direct PostgreSQL mode' }, { status: 404 });
  }

  const ip = getClientIp(request);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const raw=await request.text();if(raw.length>16384)return NextResponse.json({error:'Payload too large'},{status:413});
  let body:unknown;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}

  if(body&&typeof body==='object'&&'password' in body&&typeof body.password==='string'&&Buffer.byteLength(body.password,'utf8')>72)return NextResponse.json({error:'Choose a shorter password',code:'PASSWORD_TOO_LONG'},{status:422});
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password (min 8 chars) are required' }, { status: 400 });
  }

  const { email, password, hcaptchaToken } = parsed.data;

  try{await verifyAuthChallenge(hcaptchaToken,request);}catch(error){return error instanceof AuthChallengeError?NextResponse.json({error:error.code,code:error.code,requireCaptcha:true},{status:error.status}):NextResponse.json({error:'Authentication unavailable'},{status:503});}
  const supabase = createServiceClient();

  // Check email not already taken
  const {data:existing,error:lookupError}=await supabase.rpc('find_direct_account' as never,{p_email:email} as never);

  if(lookupError)return NextResponse.json({error:'Authentication unavailable'},{status:503});
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();

  // Derive username from email prefix
  const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const username = `${emailPrefix.slice(0,20)}_${id.slice(0,6)}`;

  const {error}=await supabase.rpc('create_localized_direct_account' as never,{p_locale:accountLocale(request),p_id:id,p_email:email,p_username:username,p_display_name:emailPrefix.slice(0,50),p_password_hash:password_hash} as never);

  if (error) {
    return NextResponse.json({error:error.code==='23505'?'Account already exists':'Failed to create account'},{status:error.code==='23505'?409:503});
  }

  const {data:profile,error:profileError}=await createServiceClient().from('users').select('*').eq('id',id).maybeSingle();
  if(profileError||!profile)return NextResponse.json({error:'Authentication unavailable'},{status:503});
  let token:string;try{token=await createDoSession({id,email});}catch{return NextResponse.json({error:'Authentication unavailable'},{status:503});}

  const response = NextResponse.json({ ok: true, token, user: clientUser(profile), userId: id });
  if(!isStatelessNativeAuth(request))response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL,
    path: '/',
  });

  return response;
}
