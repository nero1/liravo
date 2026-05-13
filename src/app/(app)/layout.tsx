import { SideNav } from '@/components/layout/SideNav';
import { BottomNav } from '@/components/layout/BottomNav';
import { createClient } from '@/lib/supabase/server';
import { isModerator } from '@/lib/moderation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const moderator = user ? await isModerator(user.id) : false;

  return (
    <div className="flex min-h-screen">
      <SideNav isModerator={moderator} />
      <main className="flex-1 pb-20 md:pb-0 min-w-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
