'use client';

import { useEffect, useState } from 'react';
import { safeReturnPath } from '@/lib/utils';
import { SecondFactorForm } from '@/components/auth/SecondFactorForm';
import { createClient } from '@/lib/supabase/client';
import { useTranslations,useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {HCaptcha} from './HCaptcha';

interface LoginFormProps {
  googleEnabled: boolean;
  telegramEnabled: boolean;
}

const isDirectPostgresMode = (process.env.NEXT_PUBLIC_DATABASE_PROVIDER ?? 'supabase') !== 'supabase';

export function LoginForm({ googleEnabled, telegramEnabled }: LoginFormProps) {
  const locale=useLocale();
  const t = useTranslations('auth');
  const common = useTranslations('common');
  const emailSecurity=useTranslations('emailSecurity');
  const router = useRouter();
  const [loading, setLoading] = useState<'google' | 'telegram' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Direct-postgres mode: email/password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [challengeToken,setChallengeToken]=useState<string|null>(null);
  const [captchaConfig,setCaptchaConfig]=useState<{enabled:boolean;siteKey:string|null}|null>(null),[captchaConfigFailed,setCaptchaConfigFailed]=useState(false),[configGeneration,setConfigGeneration]=useState(0),[captchaRequired,setCaptchaRequired]=useState(false),[captchaToken,setCaptchaToken]=useState<string|null>(null),[captchaGeneration,setCaptchaGeneration]=useState(0);
  const needsCaptcha=!!captchaConfig?.enabled&&(isSignup||captchaRequired);
  useEffect(()=>{
    if(!isDirectPostgresMode)return;const controller=new AbortController();
    fetch('/api/auth/config',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Configuration unavailable');const data=await response.json();if(typeof data.enabled!=='boolean'||data.siteKey!==null&&typeof data.siteKey!=='string')throw new Error('Configuration unavailable');setCaptchaConfig(data);}).catch(()=>{if(!controller.signal.aborted)setCaptchaConfigFailed(true);});
    return()=>controller.abort();
  },[configGeneration]);
  function completeLogin(user?:{onboarding_complete?:boolean}){
    const next=new URLSearchParams(window.location.search).get('next');
    router.push(user?.onboarding_complete===false?'/onboarding':safeReturnPath(next));router.refresh();
  }
  useEffect(()=>{
    if(isDirectPostgresMode||new URLSearchParams(window.location.search).get('mfa')!=='required')return;
    let active=true;
    fetch('/api/auth/session',{method:'POST'}).then(async response=>{
      if(!response.ok)throw new Error('Session unavailable');
      const data=await response.json();
      if(active){if(data.mfaRequired)setChallengeToken(data.challengeToken);else{router.push('/');router.refresh();}}
    }).catch(()=>{if(active)setError(t('signInFailed'));});
    return()=>{active=false;};
  },[router,t]);
  if(challengeToken)return <SecondFactorForm challengeToken={challengeToken} onSuccess={completeLogin} onCancel={()=>{setChallengeToken(null);router.replace('/login');}} />;


  // ── Direct-postgres mode ──────────────────────────────────────────────────────
  if (isDirectPostgresMode) {
    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading('email');
      setError(null);

      try {
        const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json','X-Liravo-Preferred-Locale':locale },
          body: JSON.stringify({email,password,...(captchaToken?{hcaptchaToken:captchaToken}:{})}),
        });

        const json = await res.json();

        if (!res.ok) {
          if(json.requireCaptcha){setCaptchaRequired(true);setCaptchaConfig(null);setConfigGeneration(value=>value+1);}
          if(json.code==='CAPTCHA_UNAVAILABLE'){setError(t('captchaUnavailable'));return;}
          if(json.code==='CAPTCHA_REQUIRED'||json.code==='CAPTCHA_INVALID'){setError(t('captchaRequired'));return;}
          if(json.code==='PASSWORD_TOO_LONG'){setError(t('passwordTooLong'));return;}
          if (json.error === 'PASSWORD_RESET_REQUIRED') {
            setError(
              t('passwordResetRequired')
            );
          } else {
            setError(t('signInFailed'));
          }
          return;
        }

        if(json.mfaRequired){setChallengeToken(json.challengeToken);return;}
        router.push(isSignup ? '/onboarding' : '/');
        router.refresh();
      } catch { setError(t('signInFailed')); } finally {setLoading(null);setCaptchaToken(null);setCaptchaGeneration(value=>value+1);}
    };

    return (
      <div className="space-y-4">
        {error && (
          <div role="alert" className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              required
              disabled={loading!==null}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              {t('password')}
            </label>
            <input
              id="password"
              type="password"
              required
              disabled={loading!==null}
              maxLength={72}
              minLength={isSignup ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>

          {needsCaptcha&&(captchaConfig?.siteKey?<HCaptcha key={captchaGeneration} siteKey={captchaConfig.siteKey} onToken={setCaptchaToken}/>:<p role="alert">{t('captchaUnavailable')}</p>)}
          {captchaConfigFailed&&<><p role="alert" className="text-sm text-destructive">{t('signInFailed')}</p><button type="button" onClick={()=>{setCaptchaConfigFailed(false);setConfigGeneration(value=>value+1);}} className="text-sm text-accent">{t('captchaRetry')}</button></>}
          <button
            type="submit"
            disabled={loading!==null||!captchaConfig||needsCaptcha&&!captchaToken}
            className="w-full px-4 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading === 'email'
              ? common('loading')
              : isSignup
                ? t('createAccount')
                : t('signIn')}
          </button>
        </form>

        <button
          type="button"
          disabled={loading!==null}
          onClick={() => {setIsSignup(value=>!value);setError(null);setCaptchaToken(null);setCaptchaGeneration(value=>value+1);}}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isSignup ? t('alreadyAccount') : t('needAccount')}
        </button>

        <p className="text-center text-xs text-muted-foreground pt-2">
          {t('terms')}
        </p>
        <Link href="/account/recover" className="block text-center text-sm text-accent">{emailSecurity('recover')}</Link>
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
      setError(t('signInFailed'));
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
      setError(t('signInFailed'));
      setLoading(null);
    }
  };

  if (!googleEnabled && !telegramEnabled) {
    return (
      <div className="text-center p-4 bg-muted rounded-lg text-muted-foreground">
        {t('unavailable')}
        <Link href="/account/recover" className="block text-sm text-accent">{emailSecurity('recover')}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
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
            <span className="text-sm">{common('loading')}</span>
          ) : (
            <>
              <GoogleIcon />
              <span>{t('signInWithGoogle')}</span>
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
            <span className="text-sm">{common('loading')}</span>
          ) : (
            <>
              <TelegramIcon />
              <span>{t('signInWithTelegram')}</span>
            </>
          )}
        </button>
      )}

      <p className="text-center text-xs text-muted-foreground pt-2">
        {t('terms')}
      </p>
      <Link href="/account/recover" className="block text-center text-sm text-accent">{emailSecurity('recover')}</Link>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 14.4l-2.968-.924c-.643-.203-.658-.643.136-.953l11.57-4.461c.536-.194 1.006.131.836.96l-.04.198z" />
    </svg>
  );
}
