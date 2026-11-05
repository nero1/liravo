import {accountLocale} from '@/lib/auth/locale';
import {assertSessionProviderAvailable} from '@/lib/auth/session-errors';
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isDirectPostgres } from '@/lib/db/provider';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { beginLoginChallenge, factorProfile, factorSessionResponse, providerFactorAuthorized } from '@/lib/auth/second-factor';
import { currentFactorSessionHash } from '@/lib/auth/second-factor';
import { clientUser } from '@/lib/user-profile';

export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(isDirectPostgres())return NextResponse.json({error:'Provider session exchange unavailable'},{status:404});
  if(!(await checkCriticalRateLimit(getClientIp(request))).allowed)return NextResponse.json({error:'Too many requests'},{status:429});
  try{
    const raw=createClient({skipMfa:true});
    const authorization=request.headers.get('authorization');
    const bearer=authorization?.startsWith('Bearer ')?authorization.slice(7):undefined;
    const {data:{user},error:authError}=await raw.auth.getUser(bearer);
    assertSessionProviderAvailable(authError);
    if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
    const {error:localeError}=await createServiceClient().rpc('initialize_account_locale' as never,{p_user_id:user.id,p_locale:accountLocale(request)} as never);if(localeError)throw new Error('Locale initialization unavailable');
    const profile=await factorProfile(user.id);if(!profile||profile.is_banned||profile.deleted_at)return NextResponse.json({error:'Account unavailable'},{status:403});
    const token=bearer??(await raw.auth.getSession()).data.session?.access_token;
    if(!await providerFactorAuthorized(user.id,token))return factorSessionResponse(await beginLoginChallenge(user.id,await currentFactorSessionHash(user.id)),undefined,202);
    const {data,error}=await createServiceClient().from('users').select('*').eq('id',user.id).single();if(error)throw new Error('Profile unavailable');
    return factorSessionResponse({ok:true,user:clientUser(data)});
  }catch{return NextResponse.json({error:'Session verification unavailable'},{status:503});}
}
