import {createServiceClient} from '@/lib/supabase/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import type {Metadata} from 'next';
import EmailSettingsForm from './EmailSettingsForm';

export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const t=await getTranslations('emailSecurity');return {title:t('title'),robots:{index:false}};}
export default async function EmailSettingsPage(){
  const user=await getCurrentUser();if(!user)redirect('/login');
  const t=await getTranslations('emailSecurity');
  const {data:profile,error}=await createServiceClient().from('users').select('email,email_verified,pin_hash').eq('id',user.id).single();
  if(error||!profile)throw new Error('Email settings unavailable');
  return <div className="max-w-lg mx-auto px-4 py-6 space-y-4"><h1 className="font-display text-2xl font-bold">{t('title')}</h1><p className="text-sm text-muted-foreground">{t('description')}</p><EmailSettingsForm key={user.id} actorId={user.id} currentEmail={profile.email} isVerified={profile.email_verified} pinRequired={!!profile.pin_hash}/></div>;
}
