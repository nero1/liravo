'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface LoginFormProps {
  googleEnabled: boolean;
  telegramEnabled: boolean;
}

const isDirectPostgresMode = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER ?? 'supabase') !== 'supabase';

export function LoginForm({ googleEnabled, telegramEnabled }: LoginFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [loading, setLoading] = useState<'google' | 'telegram' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Direct-postgres mode: email/password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);

  // ── Direct-postgres mode ──────────────────────────────────────────────────────
  if (isDirectPostgresMode) {
    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading('email');
      setError(null);

      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.error === 'PASSWORD_RESET_REQUIRED') {
          setError(
            'Your account was created via OAuth and has no password set. ' +
            'Contact support to receive a password reset link.'
          );
        } else {
          setError(json.error ?? 'Something went wrong');
        }
        setLoading(null);
        return;
      }

      router.push(isSignup ? '/onboarding' : '/');
      router.refresh();
    };

    return (
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={isSignup ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>

          <button
            type="submit"
            disabled={loading !== null}
            className="w-full px-4 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading === 'email'
              ? t('loading')
              : isSignup
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setIsSignup((v) => !v); setError(null); }}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>

        <p className="text-center text-xs text-muted-foreground pt-2">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    );
  }

  // ── Supabase mode (OAuth) ────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setLoading('google');
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  const handleTelegramLogin = async () => {
    setLoading('telegram');
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'telegram' as Parameters<typeof supabase.auth.signInWithOAuth>[0]['provider'],
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  if (!googleEnabled && !telegramEnabled) {
    return (
      <div className="text-center p-4 bg-muted rounded-lg text-muted-foreground">
        Sign-in is temporarily unavailable. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      {googleEnabled && (
        <button
          onClick={handleGoogleLogin}
          disabled={loading !== null}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors disabled:opacity-60"
        >
          {loading === 'google' ? (
            <span className="text-sm">{t('loading')}</span>
          ) : (
            <>
              <GoogleIcon />
              <span>{t('signInGoogle')}</span>
            </>
          )}
        </button>
      )}

      {telegramEnabled && (
        <button
          onClick={handleTelegramLogin}
          disabled={loading !== null}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#229ED9] text-white rounded-lg font-medium hover:bg-[#1a8cbe] transition-colors disabled:opacity-60"
        >
          {loading === 'telegram' ? (
            <span className="text-sm">{t('loading')}</span>
          ) : (
            <>
              <TelegramIcon />
              <span>{t('signInTelegram')}</span>
            </>
          )}
        </button>
      )}

      <p className="text-center text-xs text-muted-foreground pt-2">
        By signing in, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 14.4l-2.968-.924c-.643-.203-.658-.643.136-.953l11.57-4.461c.536-.194 1.006.131.836.96l-.04.198z" />
    </svg>
  );
}
