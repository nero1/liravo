'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { useState } from 'react';

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
] as const;

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSelect(code: string) {
    setOpen(false);
    if (code === locale) return;

    // Save preference to server
    await fetch('/api/users/locale', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: code }),
    }).catch(() => null);

    // Reload to apply the new locale via next-intl
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
        aria-label="Switch language"
      >
        <Globe size={16} strokeWidth={1.75} />
        <span>{locale.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-28 bg-card border border-border rounded-lg shadow-md overflow-hidden z-50">
          {LOCALES.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => handleSelect(code)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                code === locale
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
