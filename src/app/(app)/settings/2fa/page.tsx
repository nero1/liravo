import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import type {Metadata} from 'next';
import TwoFAClient from './TwoFAClient';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('accountSecurity');return {title:t('factorTitle'),robots:{index:false}};}
export default async function TwoFAPage(){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const t=await getTranslations('accountSecurity');
  const {data:profile,error}=await createServiceClient().from('users').select('totp_enabled,pin_hash').eq('id',user.id).single();
  if(error||!profile)throw new Error('Security settings unavailable');
  return <div className="max-w-lg mx-auto px-4 py-6 space-y-4"><h1 className="font-display text-2xl font-bold">{t('factorTitle')}</h1><p className="text-sm text-muted-foreground">{t('factorDescription')}</p><TwoFAClient key={user.id} actorId={user.id} enabled={profile.totp_enabled} pinRequired={!!profile.pin_hash}/></div>;
}
