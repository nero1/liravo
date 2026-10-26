import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { isDirectPostgres } from '@/lib/db/provider';
import { SESSION_COOKIE, destroySession } from '@/lib/db/unified-client';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { providerSessionHash } from '@/lib/auth/second-factor';

export const dynamic='force-dynamic';
export async function POST() {
  const authorization=headers().get('authorization');
  const bearer=authorization?.startsWith('Bearer ')?authorization.slice(7):undefined;
  try{
    if(isDirectPostgres()){
      const token=bearer??cookies().get(SESSION_COOKIE)?.value;if(token)await destroySession(token);
    }else{
      const client=createClient({skipMfa:true});
      const {data:{user}}=await client.auth.getUser(bearer);
      const token=bearer??(await client.auth.getSession()).data.session?.access_token;
      if(user&&token){
        const {error}=await createServiceClient().from('auth_factor_grants').delete().eq('session_hash',providerSessionHash(user.id,token));
        if(error)throw new Error('Session revocation unavailable');
      }
      await client.auth.signOut();
    }
    const response=NextResponse.json({ok:true});response.cookies.delete(SESSION_COOKIE);return response;
  }catch{return NextResponse.json({error:'Sign out unavailable'},{status:503});}
}
