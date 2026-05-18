'use client';

import Link from 'next/link';
import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';

interface AccountHardeningBannerProps {
  hasEmail: boolean;
  emailVerified: boolean;
}

export function AccountHardeningBanner({ hasEmail, emailVerified }: AccountHardeningBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Nothing to show if email is set and verified
  if ((hasEmail && emailVerified) || dismissed) return null;

  const message = !hasEmail
    ? 'Add an email address for account recovery.'
    : 'Verify your email address to secure account recovery.';

  const linkHref = '/settings/email';
  const linkLabel = !hasEmail ? 'Add email' : 'Verify now';

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm text-amber-700 dark:text-amber-400">
      <ShieldCheck size={16} className="shrink-0" />
      <p className="flex-1">{message}</p>
      <Link
        href={linkHref}
        className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline"
      >
        {linkLabel}
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 rounded hover:bg-amber-500/10 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
