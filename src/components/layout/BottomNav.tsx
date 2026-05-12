'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, Feather, BookOpen, User, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', icon: Home, labelKey: 'home' as const },
  { href: '/discover', icon: Compass, labelKey: 'discover' as const },
  { href: '/write', icon: Feather, labelKey: 'write' as const },
  { href: '/shelf', icon: BookOpen, labelKey: 'shelf' as const },
  { href: '/notifications', icon: Bell, labelKey: 'notifications' as const },
  { href: '/profile', icon: User, labelKey: 'profile' as const },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border md:hidden safe-area-bottom">
      <div className="flex">
        {NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
