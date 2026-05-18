import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { NotificationList } from '@/components/notifications/NotificationList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Notifications — Liravo',
};

export default async function NotificationsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-display font-bold">Notifications</h1>
        </div>
      </div>

      <NotificationList />
    </div>
  );
}
