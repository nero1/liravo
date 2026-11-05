import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/auth/getCurrentUser';
import {languageAlternates} from '@/lib/metadata';
import {redirect} from 'next/navigation';
import {NotificationPreferencesForm} from './NotificationPreferencesForm';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations('notificationPreferences');return {title:t('title'),alternates:languageAlternates('/settings/notifications')};}
export default async function NotificationSettingsPage(){
  const user=await getCurrentUser();if(!user)redirect('/login');
  return <NotificationPreferencesForm key={user.id} userId={user.id}/>;
}
