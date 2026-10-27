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
  idToken: z.string().min(1),
});

interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string;
  name?: string;
  picture?: string;
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,{signal:AbortSignal.timeout(8000)});
  if (!res.ok) throw new Error('Invalid Google ID token');
  const info = await res.json() as GoogleTokenInfo & { aud?: string; error?: string };
  if (info.error) throw new Error(`Google token error: ${info.error}`);

  const clients=[process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,...(process.env.GOOGLE_ALLOWED_CLIENT_IDS??'').split(',')].filter(Boolean);
  if(!clients.length)throw new Error('Google client ID is not configured');
  if (!info.aud||!clients.includes(info.aud)) throw new Error('Token audience mismatch');
  if(!z.string().email().safeParse(info.email).success||!info.sub)throw new Error('Invalid Google identity');
  if (info.email_verified !== 'true') throw new Error('Google email not verified');

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
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find or create user
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', googleInfo.email)
    .maybeSingle();

  if (!user) {
    const id = crypto.randomUUID();
    const prefix=googleInfo.email.split('@')[0].replace(/[^a-z0-9_]/gi,'_').toLowerCase().slice(0,24);
    const {data:newUser,error}=await supabase.rpc('create_direct_account' as never,{p_id:id,p_email:googleInfo.email,p_username:prefix+'_'+id.slice(0,8),p_display_name:googleInfo.name??prefix,p_google_id:googleInfo.sub,p_avatar_url:googleInfo.picture??null} as never);

    if (error || !newUser) {
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
    user=newUser as unknown as typeof user;
  } else if(user.google_id&&user.google_id!==googleInfo.sub){
    return NextResponse.json({error:'Google account identity conflict'},{status:403});
  } else if (!user.google_id) {
    // Link Google to existing account
    await supabase.from('users').update({ google_id: googleInfo.sub }).eq('id', user.id);
  }

  if(!user)return NextResponse.json({error:'Account unavailable'},{status:503});
  return directLoginResponse(user,clientUser(user),request);
}
