'use client';

import { ExternalLink } from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useBookLinkClick} from '@/lib/client/useBookLinkClick';

interface AffiliateLink {
  linkId:string;
  name: string;
  url: string;
  isAffiliate: boolean;
  isPrimary: boolean;
}

interface AffiliateLinkButtonsProps {
  links: AffiliateLink[];
  bookId: string;
  userId?:string;
}

export function AffiliateLinkButtons({ links, bookId,userId }: AffiliateLinkButtonsProps) {
  const t=useTranslations('books'),record=useBookLinkClick(bookId,userId);
  const logClick=(link:AffiliateLink)=>{void record(link.linkId).catch(()=>{});};

  const primaryLinks = links.filter((l) => l.isPrimary);
  const secondaryLinks = links.filter((l) => !l.isPrimary);

  return (
    <div className="space-y-2">
      {primaryLinks.map((link) => (
        <a
          key={link.linkId}
          href={link.url}
          target="_blank"
          rel={link.isAffiliate ? 'sponsored nofollow noopener noreferrer' : 'nofollow noopener noreferrer'}
          onClick={() => logClick(link)}
          className="flex items-center justify-center gap-2 w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
        >
          {link.name.includes('Amazon') ? t('buyOnAmazon') : link.name}
          <ExternalLink size={16} aria-hidden="true" />
        </a>
      ))}

      {secondaryLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondaryLinks.map((link) => (
            <a
              key={link.linkId}
              href={link.url}
              target="_blank"
              rel={link.isAffiliate?'sponsored nofollow noopener noreferrer':'nofollow noopener noreferrer'}
              onClick={() => logClick(link)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              {link.name}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
