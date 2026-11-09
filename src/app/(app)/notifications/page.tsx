import {getTranslations} from 'next-intl/server';
import {languageAlternates} from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { NotificationList } from '@/components/notifications/NotificationList';

export const dynamic = 'force-dynamic';

export async function generateMetadata(){const t=await getTranslations('nav');return {title:t('notifications'),alternates:languageAlternates('/notifications')};}

export default async function NotificationsPage() {
  const t=await getTranslations('nav');
  const supabase = (await createClient());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-display font-bold">{t('notifications')}</h1>
        </div>
      </div>

      <NotificationList />
    </div>
  );
}
