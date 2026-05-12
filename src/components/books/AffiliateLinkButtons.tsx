'use client';

import { ExternalLink } from 'lucide-react';

interface AffiliateLink {
  name: string;
  url: string;
  isAffiliate: boolean;
  isPrimary: boolean;
}

interface AffiliateLinkButtonsProps {
  links: AffiliateLink[];
  bookId: string;
}

export function AffiliateLinkButtons({ links, bookId }: AffiliateLinkButtonsProps) {
  const logClick = async (link: AffiliateLink) => {
    await fetch('/api/books/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId,
        storeName: link.name,
        isAffiliate: link.isAffiliate,
        linkType: link.isPrimary ? 'primary' : 'secondary',
      }),
    }).catch(() => {});
  };

  const primaryLinks = links.filter((l) => l.isPrimary);
  const secondaryLinks = links.filter((l) => !l.isPrimary);

  return (
    <div className="space-y-2">
      {primaryLinks.map((link) => (
        <a
          key={link.name}
          href={link.url}
          target="_blank"
          rel={link.isAffiliate ? 'noopener' : 'nofollow noopener'}
          onClick={() => logClick(link)}
          className="flex items-center justify-center gap-2 w-full py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors"
        >
          {link.name.includes('Amazon') ? 'Buy on Amazon' : link.name}
          <ExternalLink size={16} />
        </a>
      ))}

      {secondaryLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondaryLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="nofollow noopener"
              onClick={() => logClick(link)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              {link.name}
              <ExternalLink size={13} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
