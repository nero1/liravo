'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useAdminFeatureFlags } from '@/lib/client/useAdminFeatureFlags';

export default function FeatureFlags({ actorId, providersOnly = false }: { actorId: string; providersOnly?: boolean }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const formatter = useFormatter();
  const { flags, loading, saving, error, reload, toggle } = useAdminFeatureFlags(actorId, providersOnly);
  const visible = flags?.filter(flag => !providersOnly || ['google_auth', 'telegram_auth'].includes(flag.name));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">{t(providersOnly ? 'authProviders' : 'featureFlags')}</h1>
      <p className="text-sm text-muted-foreground mb-4">{t(providersOnly ? 'authProvidersDescription' : 'featureFlagsDescription')}</p>
      {error && <p role="alert" className="text-destructive text-sm mb-4">{t(error)}</p>}
      {loading ? <p className="text-muted-foreground">{t('loading')}</p> : flags === null ? (
        <button type="button" onClick={() => void reload()}>{common('retry')}</button>
      ) : (
        <div className="space-y-3">
          {visible?.map(flag => {
            const label = providersOnly ? t(flag.name === 'google_auth' ? 'googleOAuth' : 'telegramOAuth') : flag.name;
            const description = providersOnly ? t(flag.name === 'google_auth' ? 'allowUsersToSignInWithTheirGoogleAccount' : 'allowUsersToSignInViaTelegram') : flag.description;
            return (
              <div key={flag.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{t('updatedAt', { date: formatter.dateTime(new Date(flag.updated_at), { dateStyle: 'medium' }) })}</p>
                </div>
                <button
                  type="button" onClick={() => void toggle(flag)} disabled={saving}
                  role="switch" aria-checked={flag.enabled}
                  aria-label={t(flag.enabled ? 'disableFeature' : 'enableFeature', { name: label })}
                  className={`relative w-12 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 ${flag.enabled ? 'bg-accent' : 'bg-muted'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${flag.enabled ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            );
          })}
          {visible?.length === 0 && <p className="text-muted-foreground text-sm">{t('noFeatureFlagsFound')}</p>}
        </div>
      )}
    </div>
  );
}
