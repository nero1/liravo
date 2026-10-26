import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';
import { getFeatureFlag } from '@/lib/feature-flags';
import { FEATURE_FLAGS } from '@/constants/config';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('signIn'), description: t('description') };
}

export default async function LoginPage() {
  const t = await getTranslations('auth');
  const [googleEnabled, telegramEnabled] = await Promise.all([
    getFeatureFlag(FEATURE_FLAGS.GOOGLE_AUTH),
    getFeatureFlag(FEATURE_FLAGS.TELEGRAM_AUTH),
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold text-accent mb-2">Liravo</h1>
          <p className="text-muted-foreground">{t('tagline')}</p>
        </div>
        <LoginForm googleEnabled={googleEnabled} telegramEnabled={telegramEnabled} />
      </div>
    </div>
  );
}
