'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';

interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

export default function AdminFeatureFlagsPage() {
  const formatter = useFormatter();
  const t = useTranslations('admin');
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/feature-flags');
      if (!res.ok) throw new Error(t('loadFlagsFailed'));
      const data = await res.json() as { flags: FeatureFlag[] };
      setFlags(data.flags ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const handleToggle = async (flag: FeatureFlag) => {
    setTogglingId(flag.id);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: flag.name, enabled: !flag.enabled }),
      });
      if (!res.ok) throw new Error(t('updateFailed'));
      await fetchFlags();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t('featureFlags')}</h1>
      <p className="text-sm text-muted-foreground mb-4">{t('featureFlagsDescription')}</p>

      {error && <p role="alert" className="text-destructive text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">{t('loading')}</p>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
            >
              <div>
                <p className="font-medium text-sm">{flag.name}</p>
                {flag.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{t('updatedAt', { date: formatter.dateTime(new Date(flag.updated_at), { dateStyle: 'medium' }) })}</p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle(flag)}
                disabled={togglingId !== null}
                role="switch"
                aria-checked={flag.enabled}
                aria-label={t(flag.enabled ? 'disableFeature' : 'enableFeature', { name: flag.name })}
                className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
                  flag.enabled ? 'bg-accent' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    flag.enabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          ))}

          {flags.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('noFeatureFlagsFound')}</p>
          )}
        </div>
      )}
    </div>
  );
}
