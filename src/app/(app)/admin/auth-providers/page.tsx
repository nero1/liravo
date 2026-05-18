'use client';

import { useEffect, useState } from 'react';

interface FlagState {
  google_auth: boolean;
  telegram_auth: boolean;
}

export default function AuthProvidersPage() {
  const [flags, setFlags] = useState<FlagState>({ google_auth: true, telegram_auth: true });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/feature-flags?keys=google_auth,telegram_auth')
      .then((r) => r.json())
      .then((data: { flags?: Record<string, boolean> }) => {
        if (data.flags) setFlags(data.flags as unknown as FlagState);
      })
      .catch(() => setError('Failed to load current settings'));
  }, []);

  const toggle = async (key: 'google_auth' | 'telegram_auth') => {
    const newVal = !flags[key];
    // Safety: at least one provider must remain active
    const otherKey = key === 'google_auth' ? 'telegram_auth' : 'google_auth';
    if (!newVal && !flags[otherKey]) {
      setError('At least one sign-in provider must remain active.');
      return;
    }
    setSaving(key);
    setError(null);
    const res = await fetch('/api/admin/feature-flags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: newVal }),
    });
    setSaving(null);
    if (res.ok) {
      setFlags((prev) => ({ ...prev, [key]: newVal }));
    } else {
      setError('Failed to update setting. Try again.');
    }
  };

  const providers = [
    {
      key: 'google_auth' as const,
      label: 'Google OAuth',
      description: 'Allow users to sign in with their Google account.',
    },
    {
      key: 'telegram_auth' as const,
      label: 'Telegram OAuth',
      description: 'Allow users to sign in via Telegram.',
    },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">Auth Providers</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Toggle which OAuth providers are available on the sign-in page. At least one must stay active.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
      )}

      <div className="space-y-3">
        {providers.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between p-4 border border-border rounded-xl">
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              disabled={saving !== null}
              aria-label={`Toggle ${label}`}
              className={`relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60 ${
                flags[key] ? 'bg-accent' : 'bg-muted'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                flags[key] ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
