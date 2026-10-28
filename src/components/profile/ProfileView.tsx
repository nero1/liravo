import {useTranslations} from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { getLevelInfo } from '@/lib/utils';
import type { PublicUserRow } from '@/lib/user-profile';

interface ProfileViewProps {
  profile: PublicUserRow;
  isOwner: boolean;
}

const USER_TYPE_ICONS: Record<string, string> = {
  reader: '📖',
  author: '✍️',
  newbie_writer: '🌱',
  creator: '🎬',
};

export function ProfileView({ profile, isOwner }: ProfileViewProps) {
  const badgeText=useTranslations('badgeNames'),t=useTranslations('profile'),types=useTranslations('onboarding.userType');
  const levelInfo = getLevelInfo(profile.xp);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Banner */}
      <div className="h-32 bg-gradient-to-r from-muted to-secondary relative">
        {profile.banner_url && (
          <Image src={profile.banner_url} alt={t('banner')} fill className="object-cover" />
        )}
      </div>

      <div className="px-4">
        {/* Avatar row */}
        <div className="flex items-end justify-between -mt-12 mb-4">
          <div className="relative w-20 h-20 rounded-full border-4 border-background bg-muted overflow-hidden">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.display_name} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                {profile.display_name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {isOwner && (
            <Link
              href="/profile/edit"
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              {t('editProfile')}
            </Link>
          )}
        </div>

        {/* Name and badges */}
        <div className="mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-xl font-bold">{profile.display_name}</h1>
            {profile.is_verified_author && (
              <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full font-medium">
                {t('verified')}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">@{profile.username}</p>
        </div>

        {/* User type badges */}
        {profile.user_types.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {profile.user_types.map((type) => (
              <span key={type} className="flex items-center gap-1 px-2 py-0.5 bg-muted text-xs rounded-full">
                {USER_TYPE_ICONS[type]}
                {types(type)}
              </span>
            ))}
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm mb-3 leading-relaxed">{profile.bio}</p>
        )}

        {/* External links */}
        {profile.external_links.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {profile.external_links.slice(0, 3).map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="nofollow noopener"
                className="text-xs text-accent hover:underline truncate max-w-[200px]"
              >
                {link.replace(/^https?:\/\//, '')}
              </a>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-6 py-3 border-y border-border mb-6 text-sm">
          <div>
            <span>{t('bookCount',{count:profile.books_read_count})}</span>
          </div>
          {profile.reading_streak > 0 && (
            <div>
              <span>🔥 {t('streak',{days:profile.reading_streak})}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">{t('levels.'+levelInfo.min)}</span>
            <span className="ml-1 text-xs text-muted-foreground">({t('xp',{count:profile.xp})})</span>
          </div>
        </div>

        {/* Badges section */}
        {profile.badges && Array.isArray(profile.badges) && profile.badges.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t('badges')}</h2>
            <div className="flex flex-wrap gap-2">
              {(profile.badges as Array<{id?:string;icon:string;name:string}>).map((badge) => (
                <span
                  key={badge.id??badge.name}
                  title={badge.id&&badgeText.has(badge.id)?badgeText(badge.id):badge.name}
                  className="text-lg"
                  aria-label={badge.id&&badgeText.has(badge.id)?badgeText(badge.id):badge.name}
                >
                  {badge.icon}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
