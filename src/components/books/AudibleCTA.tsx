'use client';

import { Headphones } from 'lucide-react';

interface AudibleCTAProps {
  locale?: string;
  bookTitle?: string;
}

function getAudibleUrl(locale: string): string {
  if (locale === 'fr') {
    const tag = process.env.NEXT_PUBLIC_AUDIBLE_AFFILIATE_FR ?? '';
    return tag ? `https://www.audible.fr/?tag=${tag}` : 'https://www.audible.fr';
  }
  if (locale === 'de') {
    const tag = process.env.NEXT_PUBLIC_AUDIBLE_AFFILIATE_DE ?? '';
    return tag ? `https://www.audible.de/?tag=${tag}` : 'https://www.audible.de';
  }
  const tag = process.env.NEXT_PUBLIC_AUDIBLE_AFFILIATE_US ?? '';
  return tag ? `https://www.audible.com/?tag=${tag}` : 'https://www.audible.com';
}

export function AudibleCTA({ locale = 'en', bookTitle }: AudibleCTAProps) {
  const base = getAudibleUrl(locale);
  const url = bookTitle
    ? `${base.split('?')[0]}/search?keywords=${encodeURIComponent(bookTitle)}`
    : base;

  function handleClick() {
    fetch('/api/books/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: 'audible', locale }),
    }).catch(() => null);
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
    >
      <Headphones size={16} />
      Listen on Audible
    </a>
  );
}
