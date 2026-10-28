'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, Feather, BookOpen, User, Bell, Rss, Shield, BarChart2, MessageCircle, Target, BookMarked } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { LocaleSwitcher } from './LocaleSwitcher';

const NAV_ITEMS = [
  { href: '/', icon: Home, labelKey: 'home' as const },
  { href: '/feed', icon: Rss, labelKey: 'feed' as const },
  { href: '/discover', icon: Compass, labelKey: 'discover' as const },
  { href: '/write', icon: Feather, labelKey: 'write' as const },
  { href: '/shelf', icon: BookOpen, labelKey: 'shelf' as const },
  { href: '/profile', icon: User, labelKey: 'profile' as const },
  { href: '/notifications', icon: Bell, labelKey: 'notifications' as const },
];

interface SideNavProps {
  isModerator?: boolean;
  isAuthor?: boolean;
}

export function SideNav({ isModerator = false, isAuthor = false }: SideNavProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <aside className="hidden md:flex flex-col w-56 h-screen sticky top-0 border-e border-border bg-card p-4 gap-1">
      <Link href="/" className="mb-6 px-2">
        <span className="font-display text-2xl font-bold text-accent">Liravo</span>
      </Link>

      {NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => {
        const isActive = href === '/' ? pathname === '/' : pathname===href||pathname.startsWith(href+'/');
        return (
          <Link
            key={href}
            href={href} aria-current={isActive?'page':undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={isActive ? 2.5 : 1.75} />
            {t(labelKey)}
          </Link>
        );
      })}

      {isAuthor && (
        <>
          <Link
            href="/author/analytics" aria-current={pathname==='/author/analytics'||pathname.startsWith('/author/analytics/')?'page':undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith('/author/analytics')
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <BarChart2 size={20} strokeWidth={pathname.startsWith('/author/analytics') ? 2.5 : 1.75} />
            {t('analytics')}
          </Link>
          <Link
            href="/author/qa" aria-current={pathname==='/author/qa'||pathname.startsWith('/author/qa/')?'page':undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith('/author/qa')
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <MessageCircle size={20} strokeWidth={pathname.startsWith('/author/qa') ? 2.5 : 1.75} />
            {t('readerQuestions')}
          </Link>
        </>
      )}

      {/* Reader utilities */}
      <Link
        href="/reading-goals" aria-current={pathname==='/reading-goals'||pathname.startsWith('/reading-goals/')?'page':undefined}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          pathname.startsWith('/reading-goals')
            ? 'bg-accent/10 text-accent'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Target size={20} strokeWidth={pathname.startsWith('/reading-goals') ? 2.5 : 1.75} />
        {t('readingGoal')}
      </Link>
      <Link
        href="/arcs" aria-current={pathname==='/arcs'||pathname.startsWith('/arcs/')?'page':undefined}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          pathname.startsWith('/arcs')
            ? 'bg-accent/10 text-accent'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <BookMarked size={20} strokeWidth={pathname.startsWith('/arcs') ? 2.5 : 1.75} />
        {t('arcs')}
      </Link>

      {isAuthor && (
        <Link
          href="/author/arcs" aria-current={pathname==='/author/arcs'||pathname.startsWith('/author/arcs/')?'page':undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname.startsWith('/author/arcs')
              ? 'bg-accent/10 text-accent'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <BookMarked size={20} strokeWidth={pathname.startsWith('/author/arcs') ? 2.5 : 1.75} />
          {t('myArcs')}
        </Link>
      )}

      {isModerator && (
        <Link
          href="/moderation" aria-current={pathname==='/moderation'||pathname.startsWith('/moderation/')?'page':undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname.startsWith('/moderation')
              ? 'bg-accent/10 text-accent'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Shield size={20} strokeWidth={pathname.startsWith('/moderation') ? 2.5 : 1.75} />
          {t('moderation')}
        </Link>
      )}

      <div className="mt-auto flex flex-col gap-1">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </aside>
  );
}
