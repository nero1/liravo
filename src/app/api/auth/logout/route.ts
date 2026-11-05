import {NextResponse} from 'next/server';
import {cookies,headers} from 'next/headers';
import {isDirectPostgres} from '@/lib/db/provider';
import {SESSION_COOKIE,destroySession} from '@/lib/db/unified-client';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import {providerSessionHash,factorHash} from '@/lib/auth/second-factor';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {revokePushSession} from '@/lib/push-subscriptions';
export const dynamic='force-dynamic';
export async function POST(){
 const bearer=headers().get('authorization')?.match(/^Bearer (.+)$/)?.[1],pending:Promise<unknown>[]=[];
 let failed=false;const attempt=(work:()=>PromiseLike<unknown>|unknown)=>{pending.push(Promise.resolve().then(work));};
 try{
  if(isDirectPostgres()){
   const token=bearer??cookies().get(SESSION_COOKIE)?.value;
   if(token){
    let known=false;try{known=!!await getCurrentUser();}catch{}
    attempt(()=>revokePushSession(factorHash(token),known));attempt(()=>destroySession(token));
   }
  }else{
   const client=createClient({skipMfa:true});try{const result=await client.auth.getUser(bearer);if(result.error)failed=true;const user=result.data.user,token=bearer??(await client.auth.getSession()).data.session?.access_token;
   if(user&&token){
    const session=providerSessionHash(user.id,token);
    attempt(()=>revokePushSession(session,true));attempt(async()=>{const result=await createServiceClient().from('auth_factor_grants').delete().eq('session_hash',session);if(result.error)throw Error('Session revocation unavailable');});
   }
   }finally{attempt(async()=>{const result=await client.auth.signOut({scope:'local'});if(result.error)throw Error('Provider revocation unavailable');});}
  }
 }catch{failed=true;}
 const outcomes=await Promise.allSettled(pending);failed||=outcomes.some(result=>result.status==='rejected');
 const response=NextResponse.json(failed?{error:'Sign out unavailable'}:{ok:true},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});response.cookies.delete(SESSION_COOKIE);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;let prefix:string|undefined;try{if(url)prefix='sb-'+new URL(url).hostname.split('.')[0]+'-auth-token';}catch{}
 for(const cookie of cookies().getAll())if(prefix&&cookie.name.startsWith(prefix))response.cookies.set(cookie.name,'',{path:'/',maxAge:0});
 return response;
}
