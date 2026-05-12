import { SideNav } from '@/components/layout/SideNav';
import { BottomNav } from '@/components/layout/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SideNav />
      <main className="flex-1 pb-20 md:pb-0 min-w-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
