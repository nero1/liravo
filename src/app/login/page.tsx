import { LoginForm } from '@/components/auth/LoginForm';
import { getFeatureFlag } from '@/lib/feature-flags';
import { FEATURE_FLAGS } from '@/constants/config';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to Liravo to discover and track books.',
};

export default async function LoginPage() {
  const [googleEnabled, telegramEnabled] = await Promise.all([
    getFeatureFlag(FEATURE_FLAGS.GOOGLE_AUTH),
    getFeatureFlag(FEATURE_FLAGS.TELEGRAM_AUTH),
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold text-accent mb-2">Liravo</h1>
          <p className="text-muted-foreground">Your book discovery social network</p>
        </div>
        <LoginForm googleEnabled={googleEnabled} telegramEnabled={telegramEnabled} />
      </div>
    </div>
  );
}
