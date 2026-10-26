'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface FlagState {
  google_auth: boolean;
  telegram_auth: boolean;
}

export default function AuthProvidersPage() {
  const t = useTranslations('admin');
  const [flags, setFlags] = useState<FlagState>({ google_auth: true, telegram_auth: true });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/feature-flags?keys=google_auth,telegram_auth')
      .then((r) => { if (!r.ok) throw new Error('Settings unavailable'); return r.json(); })
      .then((data: { flags?: Array<{ name: string; enabled: boolean }> }) => {
        if (!Array.isArray(data.flags)) throw new Error('Invalid settings');
        const flags = data.flags;
        setFlags({ google_auth: flags.find(flag => flag.name === 'google_auth')?.enabled ?? false, telegram_auth: flags.find(flag => flag.name === 'telegram_auth')?.enabled ?? false });
        setLoaded(true);
      })
      .catch(() => setError(t('loadSettingsFailed')));
  }, [t]);

  const toggle = async (key: 'google_auth' | 'telegram_auth') => {
    const newVal = !flags[key];
    // Safety: at least one provider must remain active
    const otherKey = key === 'google_auth' ? 'telegram_auth' : 'google_auth';
    if (!newVal && !flags[otherKey]) {
      setError(t('lastProvider'));
      return;
    }
    setSaving(key);
    setError(null);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: key, enabled: newVal }),
      });
      if (res.ok) setFlags(prev => ({ ...prev, [key]: newVal }));
      else {
        const data = await res.json().catch(() => ({})) as { code?: string };
        setError(t(data.code === 'P1006' ? 'lastProvider' : 'updateFailed'));
      }
    } catch { setError(t('updateFailed')); }
    finally { setSaving(null); }

  };

  const providers = [
    {
      key: 'google_auth' as const,
      label: t('googleOAuth'),
      description: t('allowUsersToSignInWithTheirGoogleAccount'),
    },
    {
      key: 'telegram_auth' as const,
      label: t('telegramOAuth'),
      description: t('allowUsersToSignInViaTelegram'),
    },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-2">{t('authProviders')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t('authProvidersDescription')}</p>

      {error && (
        <div role="alert" className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">{error}</div>
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
              disabled={saving !== null || !loaded}
              role="switch"
              aria-checked={flags[key]}
              aria-label={t('toggleProvider', { name: label })}
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
