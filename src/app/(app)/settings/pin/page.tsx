import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {redirect} from 'next/navigation';
import PINSettingsClient from './PINSettingsClient';

export async function generateMetadata():Promise<Metadata>{return {title:(await getTranslations('accountSecurity'))('pinTitle'),robots:{index:false}};}

export default async function PINSettingsPage() {
  const user=await getCurrentUser();if(!user)redirect('/login');
  return <PINSettingsClient key={user.id} actorId={user.id}/>;
}
