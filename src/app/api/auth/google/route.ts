import {accountLocale} from '@/lib/auth/locale';
import { directLoginResponse } from '@/lib/auth/second-factor';
import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  idToken: z.string().min(1).max(8192),
});

interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string | boolean;
  iss:string;
  exp:string | number;
  name?: string;
  picture?: string;
}

class GoogleAuthError extends Error{constructor(message:string,public readonly status:number){super(message);}}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
  const clients=[process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,...(process.env.GOOGLE_ALLOWED_CLIENT_IDS??'').split(',')].filter((value):value is string=>typeof value==='string').map(value=>value.trim()).filter(Boolean);
  if(!clients.length)throw new GoogleAuthError('Google sign-in unavailable',503);
  let res:Response;try{res=await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});}catch{throw new GoogleAuthError('Google sign-in unavailable',503);}
  if(!res.ok)throw new GoogleAuthError(res.status===429||res.status>=500?'Google sign-in unavailable':'Invalid Google ID token',res.status===429||res.status>=500?503:401);
  const raw=await res.json().catch(()=>null);const parsed=z.object({sub:z.string().min(1).max(255),email:z.string().email().max(254),email_verified:z.union([z.literal('true'),z.literal(true)]),iss:z.enum(['accounts.google.com','https://accounts.google.com']),exp:z.union([z.string().regex(/^\d+$/),z.number().int().positive()]),aud:z.string(),name:z.string().max(1024).optional(),picture:z.string().url().max(2048).optional()}).safeParse(raw);
  if(!parsed.success)throw new GoogleAuthError('Invalid Google identity',401);const info=parsed.data;
  if(!Number.isFinite(Number(info.exp))||Number(info.exp)<=Date.now()/1000)throw new GoogleAuthError('Google identity expired',401);
  if (!info.aud||!clients.includes(info.aud)) throw new Error('Token audience mismatch');
  if(!z.string().email().safeParse(info.email).success||!info.sub)throw new Error('Invalid Google identity');
  if(info.email_verified!=='true'&&info.email_verified!==true)throw new Error('Google email not verified');

  return info;
}

export async function POST(request: Request) {
  if (!isDirectPostgres()) {
    return NextResponse.json({ error: 'This endpoint is only available in direct PostgreSQL mode' }, { status: 404 });
  }

  const ip = getClientIp(request);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'idToken is required' }, { status: 400 });

  if(!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID&&!process.env.GOOGLE_ALLOWED_CLIENT_IDS)return NextResponse.json({error:'Google sign-in is not configured'},{status:503});
  let googleInfo: GoogleTokenInfo;
  try {
    googleInfo = await verifyGoogleIdToken(parsed.data.idToken);
  } catch (err) {
    return NextResponse.json({error:err instanceof GoogleAuthError?err.message:'Invalid Google identity'},{status:err instanceof GoogleAuthError?err.status:401});
  }

  const supabase = createServiceClient();

  const {data:user,error}=await supabase.rpc('resolve_localized_social_identity',{p_locale:accountLocale(request),p_provider:'google',p_subject:googleInfo.sub,p_email:googleInfo.email.toLowerCase(),p_display_name:googleInfo.name??googleInfo.email.split('@')[0],p_avatar_url:googleInfo.picture??null});
  if(error||!user)return NextResponse.json({error:'Authentication unavailable',code:error?.code==='P1001'?'ACCOUNT_LINK_REQUIRED':'AUTH_UNAVAILABLE'},{status:error?.code==='P1003'?403:error?.code==='P1001'?409:503});
  return directLoginResponse(user as unknown as {id:string;email:string|null},clientUser(user),request);
}
