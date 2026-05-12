'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, Feather, BookOpen, User, Bell, Rss } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

const NAV_ITEMS = [
  { href: '/', icon: Home, labelKey: 'home' as const },
  { href: '/feed', icon: Rss, labelKey: 'feed' as const },
  { href: '/discover', icon: Compass, labelKey: 'discover' as const },
  { href: '/write', icon: Feather, labelKey: 'write' as const },
  { href: '/shelf', icon: BookOpen, labelKey: 'shelf' as const },
  { href: '/profile', icon: User, labelKey: 'profile' as const },
  { href: '/notifications', icon: Bell, labelKey: 'notifications' as const },
];

export function SideNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <aside className="hidden md:flex flex-col w-56 h-screen sticky top-0 border-e border-border bg-card p-4 gap-1">
      <Link href="/" className="mb-6 px-2">
        <span className="font-display text-2xl font-bold text-accent">Liravo</span>
      </Link>

      {NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
            {t(labelKey)}
          </Link>
        );
      })}

      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </aside>
  );
}
